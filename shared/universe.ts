import { CATALOG, registerInstruments } from './catalog';
import { demoQuote } from './demo';
import {
  beijingDate,
  parseBondDirectory,
  parseReitDistributionsPage,
  parseTencentFundNAV,
} from './fundamentals';
import { parseQuotes } from './parsers';
import type { TextTransport } from './source';
import type {
  Quote,
  QuoteResponse,
  ReitMetrics,
  ReitMetricsResponse,
  UniverseItem,
  UniverseKind,
  UniverseResponse,
  PureBondValues,
} from './types';

const BOND_COLUMNS = [
  'SECURITY_CODE',
  'SECUCODE',
  'SECURITY_NAME_ABBR',
  'LISTING_DATE',
  'DELIST_DATE',
  'CONVERT_STOCK_CODE',
  'SECURITY_SHORT_NAME',
  'RATING',
  'VALUE_DATE',
  'EXPIRE_DATE',
  'ACTUAL_ISSUE_SCALE',
  'TRANSFER_PRICE',
  'REDEEM_CLAUSE',
  'INTEREST_RATE_EXPLAIN',
  'NOTICE_DATE_SH',
  'EXECUTE_PRICE_SH',
  'EXECUTE_START_DATESH',
].join(',');
const BOND_QUOTE_COLUMNS = [
  'f235~10~SECURITY_CODE~TRANSFER_PRICE',
  'f239~10~SECURITY_CODE~RESALE_TRIG_PRICE',
  'f240~10~SECURITY_CODE~REDEEM_TRIG_PRICE',
].join(',');
function query(params: Record<string, string | number>) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}
const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
interface Directory {
  items: UniverseItem[];
  sourceCount: number | null;
  complete: boolean;
  updatedAt: string;
  source: string;
}

export function createUniverseSource(
  request: TextTransport,
  getQuotes: (symbols: string[]) => Promise<QuoteResponse>,
  isDemo: () => boolean,
  getPureBondValues?: (asOf: string) => Promise<PureBondValues>,
) {
  const directories = new Map<UniverseKind, { value: Directory; expires: number }>();
  const cache = new Map<UniverseKind, { value: UniverseResponse; expires: number }>();
  const running = new Map<UniverseKind, Promise<UniverseResponse>>();
  const fundCache = new Map<string, { value: ReitMetricsResponse; expires: number }>();
  const fundsRunning = new Map<string, Promise<ReitMetricsResponse>>();
  const disclosedNAV = new Map<string, ReitMetrics>();

  async function loadNAV(symbols: string[]) {
    await mapConcurrent(chunks(symbols, 150), 3, async (group) => {
      try {
        const values = parseTencentFundNAV(
          await request(`https://qt.gtimg.cn/q=${group.map((s) => `jj${s.slice(2)}`).join(',')}`),
        );
        for (const [symbol, value] of values) disclosedNAV.set(symbol, value);
      } catch {
        /* 净值失败不阻断目录或交易报价。 */
      }
    });
  }

  async function bondDirectory(): Promise<Directory> {
    async function page(pageNumber: number) {
      const raw = JSON.parse(
        await request(
          `https://datacenter-web.eastmoney.com/api/data/v1/get?${query({
            reportName: 'RPT_BOND_CB_LIST',
            columns: BOND_COLUMNS,
            quoteColumns: BOND_QUOTE_COLUMNS,
            filter: '(DELIST_DATE="NULL")',
            pageSize: 200,
            pageNumber,
            sortColumns: 'SECURITY_CODE',
            sortTypes: '1',
            source: 'WEB',
            client: 'WEB',
          })}`,
          'utf-8',
        ),
      );
      if (!raw.success || !Array.isArray(raw.result?.data))
        throw new Error('Invalid bond directory');
      return raw.result as { pages: number; count: number; data: Record<string, unknown>[] };
    }
    const first = await page(1);
    if (
      !Number.isInteger(first.pages) ||
      first.pages < 1 ||
      first.pages > 100 ||
      !Number.isInteger(first.count) ||
      first.count < 1
    )
      throw new Error('Invalid pagination');
    const rest = await mapConcurrent(
      Array.from({ length: first.pages - 1 }, (_, i) => i + 2),
      3,
      page,
    );
    if (rest.some((p) => p.count !== first.count || p.pages !== first.pages))
      throw new Error('Directory changed during pagination');
    const raw = [first, ...rest].flatMap((p) => p.data);
    if (raw.length !== first.count || new Set(raw.map((r) => r.SECURITY_CODE)).size !== first.count)
      throw new Error('Incomplete bond directory');
    const items = parseBondDirectory(raw);
    if (!items.length) throw new Error('Empty listed bond directory');
    return {
      items,
      sourceCount: first.count,
      complete: true,
      updatedAt: new Date().toISOString(),
      source: '东方财富可转债目录（全部分页）',
    };
  }

  async function reitDirectory(): Promise<Directory> {
    try {
      async function page(pn: number) {
        const raw = JSON.parse(
          await request(
            `https://95.push2.eastmoney.com/api/qt/clist/get?${query({
              pn,
              pz: 100,
              po: 0,
              np: 1,
              fltt: 2,
              invt: 2,
              fid: 'f12',
              fs: 'm:1 t:9 e:97,m:0 t:10 e:97',
              fields: 'f12,f13,f14',
            })}`,
            'utf-8',
          ),
        );
        if (
          !Array.isArray(raw.data?.diff) ||
          !Number.isInteger(raw.data?.total) ||
          raw.data.total < 1
        )
          throw new Error('Invalid REIT directory');
        return raw.data as { total: number; diff: { f12: string; f13: number; f14: string }[] };
      }
      const first = await page(1);
      if (first.total > 10000) throw new Error('REIT directory exceeds limit');
      const rest = await mapConcurrent(
        Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, i) => i + 2),
        3,
        page,
      );
      if (rest.some((p) => p.total !== first.total)) throw new Error('REIT directory changed');
      const rows = [first, ...rest].flatMap((p) => p.diff);
      if (
        rows.length !== first.total ||
        new Set(rows.map((r) => `${r.f13}.${r.f12}`)).size !== first.total
      )
        throw new Error('Incomplete REIT directory');
      const items: UniverseItem[] = rows.map((r) => ({
        symbol: `${r.f13 === 1 ? 'sh' : 'sz'}${r.f12}`,
        code: r.f12,
        name: r.f14,
        market: r.f13 === 1 ? 'SH' : 'SZ',
        type: 'reit',
      }));
      if (items.some((r) => !/^(sh508\d{3}|sz180\d{3})$/.test(r.symbol) || !r.name))
        throw new Error('Invalid REIT symbol');
      return {
        items,
        complete: true,
        sourceCount: first.total,
        source: '东方财富沪深公募REITs目录（全部分页）',
        updatedAt: new Date().toISOString(),
      };
    } catch {
      // 沪深公募 REITs 专属的完整六位代码段。每个代码均向报价源确认，不能以名称搜索前几十条冒充全市场。
      const symbols = [
        ...Array.from({ length: 1000 }, (_, i) => `sh${508000 + i}`),
        ...Array.from({ length: 1000 }, (_, i) => `sz${180000 + i}`),
      ];
      let complete = true;
      const groups = await mapConcurrent(chunks(symbols, 150), 3, async (group) => {
        try {
          return parseQuotes(await request(`https://qt.gtimg.cn/q=${group.join(',')}`));
        } catch {
          complete = false;
          return [];
        }
      });
      const quotes = [
        ...new Map(
          groups
            .flat()
            .filter((q) => q.timestamp && q.type === 'reit')
            .map((q) => [q.symbol, q]),
        ).values(),
      ];
      if (!quotes.length || !complete) throw new Error('REIT code verification incomplete');
      return {
        items: quotes.map(({ symbol, code, name, market, type }) => ({
          symbol,
          code,
          name,
          market,
          type,
        })),
        complete: true,
        sourceCount: null,
        source: '腾讯行情核验沪深REITs完整代码段 508xxx / 180xxx',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async function load(kind: UniverseKind): Promise<UniverseResponse> {
    const saved = cache.get(kind);
    if (saved && saved.expires > Date.now()) return saved.value;
    let result: UniverseResponse;
    try {
      if (isDemo()) throw new Error('Explicit demo mode');
      const stored = directories.get(kind);
      let directory = stored?.value;
      let stale = false;
      if (!stored || stored.expires <= Date.now()) {
        try {
          directory = await (kind === 'bond' ? bondDirectory() : reitDirectory());
          directories.set(kind, {
            value: directory,
            expires: Date.now() + (kind === 'bond' ? 300_000 : 6 * 3600_000),
          });
        } catch (error) {
          if (!directory) throw error;
          stale = true;
        }
      }
      if (!directory) throw new Error('No directory');
      registerInstruments(directory.items);
      const symbols = [
        ...new Set(
          directory.items.flatMap((r) => (r.underlying ? [r.symbol, r.underlying] : [r.symbol])),
        ),
      ];
      const batches = await mapConcurrent(chunks(symbols, 150), 3, async (group) => {
        try {
          return await getQuotes(group);
        } catch {
          return null;
        }
      });
      const quotes = batches.flatMap(
        (batch) => batch?.quotes.filter((q) => q.source !== 'demo') ?? [],
      );
      const missing = directory.items.filter(
        (r) => !quotes.some((q) => q.symbol === r.symbol),
      ).length;
      const cachedQuotes = batches.some((b) => b?.mode === 'cached');
      if (kind === 'reit') await loadNAV(directory.items.map((item) => item.symbol));
      let pure: PureBondValues | null = null;
      if (kind === 'bond' && getPureBondValues) {
        const days = quotes
          .filter((q) => q.type === 'bond' && q.timestamp)
          .map((q) => q.timestamp!.slice(0, 10));
        if (days.length) {
          try {
            pure = await getPureBondValues(days.sort().at(-1)!);
          } catch {
            /* 独立估值失败不阻断完整名单和报价。 */
          }
        }
      }
      result = {
        kind,
        items:
          kind === 'reit'
            ? directory.items.map((item) => ({ ...item, reit: disclosedNAV.get(item.symbol) }))
            : directory.items.map((item) =>
                item.bond
                  ? {
                      ...item,
                      bond: {
                        ...item.bond,
                        pureBondValue: pure?.values[item.symbol] ?? null,
                        pureBondDate: pure?.values[item.symbol] != null ? pure.date : null,
                      },
                    }
                  : item,
              ),
        quotes,
        complete: directory.complete && !stale,
        mode: stale || cachedQuotes ? 'cached' : 'live',
        total: directory.items.length,
        sourceCount: directory.sourceCount,
        fetchedAt: new Date().toISOString(),
        directoryUpdatedAt: directory.updatedAt,
        source: directory.source,
        message: `${stale ? '目录更新失败，保留上次完整名单。' : '已核对完整目录。'}${missing ? `${missing}只行情暂缺，仍保留在名单中。` : ''}净值、分红与条款日期独立于报价时间。`,
      };
    } catch {
      const previous = cache.get(kind)?.value;
      if (previous && previous.mode !== 'demo')
        result = {
          ...previous,
          mode: 'cached',
          complete: false,
          message: '目录或行情更新失败，保留上次数据，请留意原始时间。',
        };
      else {
        const items = CATALOG.filter((r) => r.type === kind && r.market !== 'HK');
        result = {
          kind,
          items,
          quotes: items.flatMap((r) => {
            const q = demoQuote(r.symbol);
            return q ? [q] : [];
          }),
          mode: 'demo',
          complete: false,
          total: null,
          sourceCount: null,
          source: '精选演示目录',
          fetchedAt: new Date().toISOString(),
          directoryUpdatedAt: '2025-03-14T15:00:00+08:00',
          message: '未取到全市场目录，当前仅为精选演示样本，不能代表全市场。',
        };
      }
    }
    cache.set(kind, {
      value: result,
      expires: Date.now() + (result.mode === 'live' ? 30_000 : 10_000),
    });
    return result;
  }
  function getUniverse(kind: UniverseKind): Promise<UniverseResponse> {
    if (kind !== 'bond' && kind !== 'reit')
      return Promise.reject(new Error('Invalid universe kind'));
    const active = running.get(kind);
    if (active) return active;
    const promise = load(kind).finally(() => running.delete(kind));
    running.set(kind, promise);
    return promise;
  }

  function getReitMetrics(symbol: string): Promise<ReitMetricsResponse> {
    if (!/^(sh508\d{3}|sz180\d{3})$/.test(symbol))
      return Promise.reject(new Error('Invalid REIT symbol'));
    const saved = fundCache.get(symbol);
    if (saved && saved.expires > Date.now()) return Promise.resolve(saved.value);
    const active = fundsRunning.get(symbol);
    if (active) return active;
    const promise = (async (): Promise<ReitMetricsResponse> => {
      let value: ReitMetricsResponse;
      try {
        if (isDemo()) throw new Error('Demo mode excludes fictitious fundamentals');
        const [html] = await Promise.all([
          request(`https://fund.eastmoney.com/${symbol.slice(2)}.html`, 'utf-8'),
          disclosedNAV.has(symbol) ? Promise.resolve() : loadNAV([symbol]),
        ]);
        const nav = disclosedNAV.get(symbol);
        if (!nav) throw new Error('No valid disclosed net asset value');
        const dividends = parseReitDistributionsPage(html, beijingDate());
        const metrics: ReitMetrics = dividends ? { ...nav, ...dividends, source: 'mixed' } : nav;
        value = {
          symbol,
          available: true,
          metrics,
          fetchedAt: new Date().toISOString(),
          message: dividends?.complete
            ? '腾讯披露净值＋天天基金现金分红明细；每10份分红已换算为每份，已核对近12月记录覆盖，不作未来分派预测。'
            : '已取得腾讯披露净值；现金分红记录未完整覆盖近12个月，分派率留空。',
        };
      } catch {
        if (!isDemo() && !disclosedNAV.has(symbol)) await loadNAV([symbol]);
        const fallback = isDemo() ? null : (disclosedNAV.get(symbol) ?? null);
        value = {
          symbol,
          available: !!fallback,
          metrics: fallback,
          fetchedAt: new Date().toISOString(),
          message: fallback
            ? '已取得腾讯披露单位净值和净值日期；现金分红历史未取得，分派率留空。'
            : '净值及分红数据未取得，不用交易价格反推，也不将缺失分红视为零。',
        };
      }
      if (fundCache.size > 500) fundCache.clear();
      fundCache.set(symbol, {
        value,
        expires: Date.now() + (value.available ? 12 * 3600_000 : 60_000),
      });
      return value;
    })().finally(() => fundsRunning.delete(symbol));
    fundsRunning.set(symbol, promise);
    return promise;
  }
  return { getUniverse, getReitMetrics };
}
