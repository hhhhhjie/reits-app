import { CATALOG, HK_REITS, registerInstruments } from './catalog';
import { dateOnly } from './fundamentals';
import type { TextTransport } from './source';
import type { IncomeResponse, IncomeScope, Instrument, QuoteResponse } from './types';
import { mapConcurrent } from './universe';

type Row = Record<string, unknown>;
const params = (input: Record<string, string | number>) =>
  Object.entries(input)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

// 按稳定的证券代码顺序读完所有分页；计数漂移、重复或失败均不能宣称完整。
export async function readIncomeDirectory(
  request: TextTransport,
  scope: 'a' | 'hk',
): Promise<{ items: Instrument[]; count: number; date: string }> {
  const reportName = scope === 'a' ? 'RPT_VALUEANALYSIS_DET' : 'RPT_HK_ORGPROFILE';
  async function page(pageNumber: number, filter = '', latest = false) {
    const raw = JSON.parse(
      await request(
        `https://datacenter-web.eastmoney.com/api/data/v1/get?${params({
          reportName,
          columns:
            scope === 'a'
              ? 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE'
              : 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR',
          pageNumber,
          pageSize: latest ? 1 : 500,
          filter,
          sortColumns: latest ? 'TRADE_DATE' : 'SECURITY_CODE',
          sortTypes: latest ? '-1' : '1',
          source: 'WEB',
          client: 'WEB',
        })}`,
        'utf-8',
      ),
    );
    const r = raw.result;
    if (
      !raw.success ||
      !Array.isArray(r?.data) ||
      !Number.isInteger(r.pages) ||
      r.pages < 1 ||
      r.pages > (latest ? 100000000 : 100) ||
      !Number.isInteger(r.count) ||
      r.count < 1
    )
      throw new Error('Invalid stock directory');
    return r as { data: Row[]; count: number; pages: number };
  }
  let date = new Date().toISOString().slice(0, 10),
    filter = '';
  if (scope === 'a') {
    const latest = await page(1, '', true);
    const day = dateOnly(latest.data[0]?.TRADE_DATE);
    if (!day) throw new Error('Missing stock directory date');
    date = day;
    filter = `(TRADE_DATE='${day}')`;
  }
  const first = await page(1, filter);
  const rest = await mapConcurrent(
    Array.from({ length: first.pages - 1 }, (_, i) => i + 2),
    3,
    (pn) => page(pn, filter),
  );
  const rows = [first, ...rest].flatMap((p) => p.data);
  if (
    rest.some((p) => p.count !== first.count || p.pages !== first.pages) ||
    rows.length !== first.count ||
    new Set(rows.map((r) => r.SECUCODE)).size !== first.count
  )
    throw new Error('Incomplete stock directory');
  const items: Instrument[] = rows.flatMap((r) => {
    const code = String(r.SECURITY_CODE ?? ''),
      secucode = String(r.SECUCODE ?? '');
    if (typeof r.SECURITY_NAME_ABBR !== 'string' || !r.SECURITY_NAME_ABBR) return [];
    const market =
      scope === 'hk' && /^\d{5}\.HK$/.test(secucode) && code === secucode.slice(0, 5)
        ? 'HK'
        : scope === 'a' && /^6\d{5}\.SH$/.test(secucode) && code === secucode.slice(0, 6)
          ? 'SH'
          : scope === 'a' && /^(?:00|30)\d{4}\.SZ$/.test(secucode) && code === secucode.slice(0, 6)
            ? 'SZ'
            : null;
    if (!market) return [];
    return [
      {
        symbol: `${market.toLowerCase()}${code}`,
        code,
        name: r.SECURITY_NAME_ABBR,
        market,
        type: 'stock',
      },
    ];
  });
  if (!items.length) throw new Error('Empty stock directory');
  return { items, count: first.count, date };
}

export function createIncomeSource(
  request: TextTransport,
  getQuotes: (symbols: string[]) => Promise<QuoteResponse>,
  isDemo: () => boolean,
) {
  const directories = new Map<
    IncomeScope,
    { items: Instrument[]; count: number | null; date: string; expires: number }
  >();
  const cache = new Map<IncomeScope, { value: IncomeResponse; expires: number }>();
  const running = new Map<IncomeScope, Promise<IncomeResponse>>();
  async function load(scope: IncomeScope): Promise<IncomeResponse> {
    const hit = cache.get(scope);
    if (hit && hit.expires > Date.now()) return hit.value;
    let value: IncomeResponse;
    try {
      if (isDemo()) throw new Error('Explicit demo mode');
      let directory = directories.get(scope);
      if (!directory || directory.expires <= Date.now()) {
        const result =
          scope === 'hkreit'
            ? { items: HK_REITS, count: null, date: '2026-10-19' }
            : await readIncomeDirectory(request, scope);
        directory = { ...result, expires: Date.now() + 30 * 60_000 };
        directories.set(scope, directory);
      }
      registerInstruments(directory.items);
      const batches = await mapConcurrent(
        chunks(
          directory.items.map((i) => i.symbol),
          150,
        ),
        3,
        async (symbols) => {
          try {
            return await getQuotes(symbols);
          } catch {
            return null;
          }
        },
      );
      const quotes = batches.flatMap(
        (b) =>
          b?.quotes.filter(
            (q) =>
              q.source !== 'demo' && (scope !== 'hkreit' || q.securityClass === 'GP-FUND-REITS'),
          ) ?? [],
      );
      const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
      const items = directory.items.map((i) => ({
        ...i,
        name: bySymbol.get(i.symbol)?.name ?? i.name,
      }));
      const missing = items.length - items.filter((i) => bySymbol.has(i.symbol)).length;
      value = {
        scope,
        items,
        quotes,
        mode: batches.some((b) => b?.mode === 'cached') || !quotes.length ? 'cached' : 'live',
        directoryComplete: scope !== 'hkreit',
        sourceCount: directory.count,
        directoryDate: directory.date,
        fetchedAt: new Date().toISOString(),
        source:
          scope === 'a'
            ? '东方财富最新交易日沪深A股目录＋腾讯公开行情'
            : scope === 'hk'
              ? '东方财富港股公司目录＋腾讯公开行情'
              : '维护的10只港股REITs名单＋腾讯公开行情',
        message: `${scope === 'hkreit' ? '港股REITs为维护名单，未宣称动态全市场。' : scope === 'hk' ? '已读完源端港股公司目录，源覆盖不等于全部港交所证券；可能含停牌或历史代码。' : '已读完最新交易日源目录，仅含沪深A股，不含北交所或B股。'}${missing ? `${missing}只报价暂缺，仍保留名称。` : ''}股息率为行情源口径，非未来收益。五年均值和估值温度未接入可靠历史数据，保持缺失。`,
      };
    } catch {
      const old = cache.get(scope)?.value;
      value =
        old && old.mode !== 'demo'
          ? {
              ...old,
              mode: 'cached',
              directoryComplete: false,
              message: '更新失败，保留上次目录和原始报价时间。',
            }
          : {
              scope,
              items:
                scope === 'hkreit'
                  ? HK_REITS
                  : CATALOG.filter(
                      (i) =>
                        i.type === 'stock' &&
                        (scope === 'a' ? i.market !== 'HK' : i.market === 'HK'),
                    ),
              quotes: [],
              mode: 'demo',
              directoryComplete: false,
              sourceCount: null,
              directoryDate: '2025-03-14',
              fetchedAt: new Date().toISOString(),
              source: '精选演示目录',
              message:
                '未取得真实股息行情，当前仅显示精选名称；不生成演示股息率、五年均值或估值温度。',
            };
    }
    cache.set(scope, { value, expires: Date.now() + (value.mode === 'live' ? 30_000 : 10_000) });
    return value;
  }
  function getIncome(scope: IncomeScope) {
    if (!['a', 'hk', 'hkreit'].includes(scope))
      return Promise.reject(new Error('Invalid income scope'));
    const active = running.get(scope);
    if (active) return active;
    const result = load(scope).finally(() => running.delete(scope));
    running.set(scope, result);
    return result;
  }
  return { getIncome };
}
