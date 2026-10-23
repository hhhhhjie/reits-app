import { beijingDate, dateOnly, numeric } from './fundamentals';
import { dateGap, validDate } from './bond-model';
import type { TextTransport } from './source';
import type { BondModelInputs, PureBondValues, TreasuryPoint } from './types';

const query = (p: Record<string, string | number>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
const TREASURY_FIELDS = [
  ['EMM00588704', 2],
  ['EMM00166462', 5],
  ['EMM00166466', 10],
  ['EMM00166469', 30],
] as const;
export function parseTreasury(row: Record<string, unknown>, asOf: string) {
  const date = dateOnly(row.SOLAR_DATE);
  if (!date || !validDate(date) || date > asOf || dateGap(asOf, date) > 14) return null;
  const curve: TreasuryPoint[] = TREASURY_FIELDS.flatMap(([key, years]) => {
    const rate = numeric(row[key]);
    return rate != null && rate > -100 ? [{ years, rate }] : [];
  });
  return curve.length === 4 ? { date, curve } : null;
}
// CHANGE_RATE为来源日涨跌幅百分数。直接采用其对数收益，不将未复权收盘价相除。
export function dailyChangeVolatility(
  rows: Record<string, unknown>[],
  symbol: string,
  asOf: string,
) {
  if (!validDate(asOf) || rows.length < 60) return null;
  const observed = rows.map((r) => ({
    code: String(r.SECURITY_CODE ?? ''),
    date: dateOnly(r.TRADE_DATE),
    change: numeric(r.CHANGE_RATE),
  }));
  if (
    observed.some(
      (r) =>
        r.code !== symbol.slice(2) ||
        !r.date ||
        !validDate(r.date) ||
        r.date >= asOf ||
        r.change == null ||
        r.change <= -100,
    )
  )
    return null;
  const selected = observed.sort((a, b) => a.date!.localeCompare(b.date!)).slice(-60);
  if (new Set(selected.map((r) => r.date)).size !== 60) return null;
  const startDate = selected[0].date!,
    endDate = selected[59].date!;
  if (
    dateGap(asOf, endDate) > 14 ||
    dateGap(endDate, startDate) > 200 ||
    selected.slice(1).some((r, i) => dateGap(r.date!, selected[i].date!) > 14)
  )
    return null;
  const returns = selected.map((r) => Math.log1p(r.change! / 100)),
    mean = returns.reduce((s, r) => s + r, 0) / 60;
  const volatility = Math.sqrt((returns.reduce((s, r) => s + (r - mean) ** 2, 0) / 59) * 252) * 100;
  return Number.isFinite(volatility) ? { volatility, startDate, endDate, returnCount: 60 } : null;
}
export function createBondModelSource(request: TextTransport, isDemo: () => boolean) {
  const pureCache = new Map<string, { value: PureBondValues; expires: number }>(),
    pureRunning = new Map<string, Promise<PureBondValues>>(),
    treasuryCache = new Map<string, { date: string; curve: TreasuryPoint[] }>(),
    treasuryRunning = new Map<string, Promise<{ date: string; curve: TreasuryPoint[] } | null>>(),
    inputCache = new Map<string, { value: BondModelInputs; expires: number }>(),
    running = new Map<string, Promise<BondModelInputs>>();
  function allowedDate(asOf: string) {
    return validDate(asOf) && asOf <= beijingDate() && dateGap(beijingDate(), asOf) <= 370;
  }
  async function data(reportName: string, extra: Record<string, string | number>) {
    const raw = JSON.parse(
      await request(
        `https://datacenter-web.eastmoney.com/api/data/v1/get?${query({ reportName, columns: 'ALL', pageNumber: 1, pageSize: 1, source: 'WEB', client: 'WEB', ...extra })}`,
        'utf-8',
      ),
    );
    if (!raw.success || !Array.isArray(raw.result?.data)) throw new Error('Invalid model source');
    return raw.result as { data: Record<string, unknown>[]; count: number; pages: number };
  }
  function getPureBondValues(asOf: string): Promise<PureBondValues> {
    if (!allowedDate(asOf)) return Promise.reject(new Error('Invalid valuation date'));
    const saved = pureCache.get(asOf);
    if (saved && saved.expires > Date.now()) return Promise.resolve(saved.value);
    const pending = pureRunning.get(asOf);
    if (pending) return pending;
    const promise = (async () => {
      let value: PureBondValues;
      try {
        if (isDemo()) throw new Error('No demo valuations');
        const latest = await data('RPTA_WEB_KZZ_LS', {
          filter: `(DATE<='${asOf}')`,
          sortColumns: 'DATE',
          sortTypes: '-1',
        });
        const day = dateOnly(latest.data[0]?.DATE);
        if (!day || !validDate(day) || day > asOf || dateGap(asOf, day) > 14)
          throw new Error('No recent pure bond date');
        const pages = [
          await data('RPTA_WEB_KZZ_LS', {
            filter: `(DATE='${day}')`,
            sortColumns: 'ZCODE',
            sortTypes: '1',
            pageSize: 500,
          }),
        ];
        const first = pages[0];
        if (
          !Number.isInteger(first.pages) ||
          first.pages < 1 ||
          first.pages > 20 ||
          !Number.isInteger(first.count) ||
          first.count < 1
        )
          throw new Error('Invalid valuation pagination');
        for (let pageNumber = 2; pageNumber <= first.pages; pageNumber++)
          pages.push(
            await data('RPTA_WEB_KZZ_LS', {
              filter: `(DATE='${day}')`,
              sortColumns: 'ZCODE',
              sortTypes: '1',
              pageSize: 500,
              pageNumber,
            }),
          );
        const rows = pages.flatMap((p) => p.data);
        if (
          pages.some((p) => p.count !== first.count || p.pages !== first.pages) ||
          rows.length !== first.count ||
          new Set(rows.map((r) => r.ZCODE)).size !== first.count ||
          rows.some((r) => dateOnly(r.DATE) !== day)
        )
          throw new Error('Incomplete pure bond values');
        const values: Record<string, number> = {};
        for (const r of rows) {
          const secucode = String(r.SECUCODE ?? ''),
            code = String(r.ZCODE ?? ''),
            pv = numeric(r.PUREBONDVALUE);
          if (
            !/^(?:11\d{4}\.SH|12\d{4}\.SZ)$/.test(secucode) ||
            code !== secucode.slice(0, 6) ||
            pv == null ||
            pv <= 0
          )
            continue;
          values[`${secucode.slice(-2).toLowerCase()}${code}`] = pv;
        }
        if (!Object.keys(values).length) throw new Error('No valid pure bond values');
        value = {
          asOf,
          date: day,
          available: true,
          values,
          message: '东方财富日终纯债估值，每百元面值；不等于保证兑付金额。',
        };
      } catch {
        value = {
          asOf,
          date: null,
          available: false,
          values: {},
          message: '纯债估值未取得，不使用交易价格或到期赎回价代替。',
        };
      }
      if (pureCache.size > 32) pureCache.clear();
      pureCache.set(asOf, { value, expires: Date.now() + (value.available ? 300_000 : 30_000) });
      return value;
    })().finally(() => pureRunning.delete(asOf));
    pureRunning.set(asOf, promise);
    return promise;
  }
  function treasury(asOf: string) {
    const saved = treasuryCache.get(asOf);
    if (saved) return Promise.resolve(saved);
    const pending = treasuryRunning.get(asOf);
    if (pending) return pending;
    const promise = (async () => {
      try {
        const rows = await data('RPTA_WEB_TREASURYYIELD', {
          filter: `(SOLAR_DATE<='${asOf}')`,
          sortColumns: 'SOLAR_DATE',
          sortTypes: '-1',
          pageSize: 20,
        });
        const result =
          rows.data.map((row) => parseTreasury(row, asOf)).find((r) => r != null) ?? null;
        if (result) {
          if (treasuryCache.size > 32) treasuryCache.clear();
          treasuryCache.set(asOf, result);
        }
        return result;
      } catch {
        return null;
      }
    })().finally(() => treasuryRunning.delete(asOf));
    treasuryRunning.set(asOf, promise);
    return promise;
  }
  function getBondModelInputs(symbol: string, asOf: string): Promise<BondModelInputs> {
    if (!/^(?:sh6\d{5}|sz(?:00|30)\d{4})$/.test(symbol) || !allowedDate(asOf))
      return Promise.reject(new Error('Invalid stock or valuation date'));
    const key = `${symbol}:${asOf}`,
      saved = inputCache.get(key);
    if (saved && saved.expires > Date.now()) return Promise.resolve(saved.value);
    const pending = running.get(key);
    if (pending) return pending;
    const promise = (async () => {
      let vol: ReturnType<typeof dailyChangeVolatility> = null,
        rate: Awaited<ReturnType<typeof treasury>> = null;
      if (!isDemo())
        await Promise.all([
          data('RPT_VALUEANALYSIS_DET', {
            columns: 'SECURITY_CODE,TRADE_DATE,CHANGE_RATE',
            filter: `(SECURITY_CODE="${symbol.slice(2)}")(TRADE_DATE<'${asOf}')`,
            sortColumns: 'TRADE_DATE',
            sortTypes: '-1',
            pageSize: 60,
          })
            .then((h) => {
              vol = dailyChangeVolatility(h.data, symbol, asOf);
            })
            .catch(() => {}),
          treasury(asOf)
            .then((r) => {
              rate = r;
            })
            .catch(() => {}),
        ]);
      // TypeScript cannot narrow assignment through asynchronous callbacks.
      const observed = vol as ReturnType<typeof dailyChangeVolatility>,
        curve = rate as Awaited<ReturnType<typeof treasury>>;
      const value: BondModelInputs = {
        symbol,
        asOf,
        available: !!observed && !!curve,
        volatility: observed?.volatility ?? null,
        volatilityStartDate: observed?.startDate ?? null,
        volatilityEndDate: observed?.endDate ?? null,
        volatilitySource: observed ? 'eastmoney-daily-change' : null,
        returnCount: observed?.returnCount ?? 0,
        treasuryCurve: curve?.curve ?? [],
        treasuryDate: curve?.date ?? null,
        fetchedAt: new Date().toISOString(),
        message:
          observed && curve
            ? '东方财富60个完整交易日日涨跌幅对数收益＋中国国债2/5/10/30年收益率。'
            : !observed
              ? '缺少足够的真实日涨跌幅历史，或数据过旧；期权估值留空。'
              : '未取得报价日可用的中国国债收益率；期权估值留空。',
      };
      if (inputCache.size > 1000) inputCache.clear();
      inputCache.set(key, {
        value,
        expires: Date.now() + (value.available ? 12 * 3600_000 : 30_000),
      });
      return value;
    })().finally(() => running.delete(key));
    running.set(key, promise);
    return promise;
  }
  return { getPureBondValues, getBondModelInputs };
}
