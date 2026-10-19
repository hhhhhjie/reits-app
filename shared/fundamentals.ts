import type { BondMetrics, ReitMetrics, UniverseItem } from './types';

export function numeric(value: unknown): number | null {
  if (value == null || value === '' || value === '-' || value === '--') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}
export function dateOnly(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(value)
    ? value.slice(0, 10)
    : null;
}
export function beijingDate(time = Date.now()) {
  return new Date(time + 8 * 3600_000).toISOString().slice(0, 10);
}

export function parseBondTerms(row: Record<string, unknown>): BondMetrics {
  const explanation = String(row.INTEREST_RATE_EXPLAIN ?? '').replaceAll('％', '%');
  const coupons = [...explanation.matchAll(/第([一二三四五六七八九十\d]+)年\s*([\d.]+)\s*%/g)];
  const ordinals: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const rates = coupons.every(
    (match, index) => (ordinals[match[1]] ?? Number(match[1])) === index + 1,
  )
    ? coupons.map((match) => Number(match[2]))
    : [];
  // 只解析明确写明包含最后一期利息的到期赎回金额，不能把强赎价当到期价。
  const maturityClause = String(row.REDEEM_CLAUSE ?? '').split(/有条件赎回/)[0];
  const redemption = maturityClause.match(
    /面值(?:的|为)?\s*([\d.]+)%[^。]{0,35}含最后一期(?:年度)?利息/,
  );
  return {
    conversionPrice: positive(row.TRANSFER_PRICE),
    stockName: typeof row.SECURITY_SHORT_NAME === 'string' ? row.SECURITY_SHORT_NAME : null,
    rating: typeof row.RATING === 'string' ? row.RATING : null,
    issueScale: positive(row.ACTUAL_ISSUE_SCALE),
    issueDate: dateOnly(row.VALUE_DATE),
    listingDate: dateOnly(row.LISTING_DATE),
    maturityDate: dateOnly(row.EXPIRE_DATE),
    couponRates:
      rates.length && rates.every((x) => Number.isFinite(x) && x >= 0 && x < 100) ? rates : null,
    redemptionPrice: redemption ? positive(redemption[1]) : null,
    redeemTriggerPrice: positive(row.REDEEM_TRIG_PRICE),
    resaleTriggerPrice: positive(row.RESALE_TRIG_PRICE),
    redeemNoticeDate: dateOnly(row.NOTICE_DATE_SH),
    redeemDate: dateOnly(row.EXECUTE_START_DATESH),
    redeemPrice: positive(row.EXECUTE_PRICE_SH),
  };
}
function positive(value: unknown) {
  const n = numeric(value);
  return n != null && n > 0 ? n : null;
}

export function parseBondDirectory(
  rows: Record<string, unknown>[],
  today = beijingDate(),
): UniverseItem[] {
  return rows.flatMap((row) => {
    const code = String(row.SECURITY_CODE ?? '');
    const name = row.SECURITY_NAME_ABBR;
    const listing = dateOnly(row.LISTING_DATE),
      delist = dateOnly(row.DELIST_DATE);
    // 仅限沪深已上市可转债；不把待上市、已退市及可交换债混入列表。
    if (
      !/^(?:11\d{4}|12\d{4})$/.test(code) ||
      typeof name !== 'string' ||
      !name ||
      !listing ||
      listing > today ||
      (delist && delist <= today) ||
      /(?:可交|交换|[Ee][Bb])/.test(name)
    )
      return [];
    const market = String(row.SECUCODE).endsWith('.SH')
      ? 'SH'
      : String(row.SECUCODE).endsWith('.SZ')
        ? 'SZ'
        : null;
    if (!market) return [];
    const underlyingCode = String(row.CONVERT_STOCK_CODE ?? '');
    return [
      {
        symbol: `${market.toLowerCase()}${code}`,
        code,
        name,
        market,
        type: 'bond' as const,
        underlying: /^\d{6}$/.test(underlyingCode)
          ? `${/^[569]/.test(underlyingCode) ? 'sh' : 'sz'}${underlyingCode}`
          : undefined,
        bond: parseBondTerms(row),
      },
    ];
  });
}

export function parseReitFundHistory(script: string, asOf = beijingDate()): ReitMetrics | null {
  // 仅读取 JSON 数组；不执行远程 JavaScript。
  const json = script.match(/\b(?:var\s+)?Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/)?.[1];
  if (!json) return null;
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(input) || input.length > 20000) return null;
  const records = input
    .flatMap((row: Record<string, unknown>) => {
      const time = numeric(row?.x),
        nav = positive(row?.y);
      if (time == null || time < 0 || time > 8640000000000000 || nav == null) return [];
      const date = beijingDate(time);
      return date <= asOf ? [{ date, nav, text: String(row.unitMoney ?? '') }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!records.length) return null;
  const latest = records[records.length - 1];
  const cutoffDate = new Date(`${asOf}T00:00:00+08:00`);
  cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
  const cutoff = beijingDate(cutoffDate.getTime());
  const distributions = [
    ...new Map(
      records.flatMap((r) => {
        const amount = r.text.match(/(?:每份)?(?:派(?:发)?现金|现金分红|分红)\s*([\d.]+)\s*元/);
        const value = amount ? positive(amount[1]) : null;
        return value == null ? [] : [[r.date, { date: r.date, amount: value }] as const];
      }),
    ).values(),
  ];
  const ttm = distributions.filter((r) => r.date > cutoff);
  const last = distributions[distributions.length - 1];
  return {
    nav: latest.nav,
    navDate: latest.date,
    cumulativeNav: null,
    source: 'eastmoney-fund',
    // 没有明确分红记录时保持缺失，不能把源端缺数据当作零分派。
    cashDistributionTtm: ttm.length ? ttm.reduce((total, r) => total + r.amount, 0) : null,
    lastDistribution: last?.amount ?? null,
    lastDistributionDate: last?.date ?? null,
    distributionCount: ttm.length,
    coverageStart: records[0].date,
    asOfDate: asOf,
  };
}

// 腾讯 jj 协议：5/6 为已披露单位/累计净值，8 为净值日期；2/3 是估值字段，不能用于历史净值。
export function parseTencentFundNAV(text: string, asOf = beijingDate()): Map<string, ReitMetrics> {
  const records = new Map<string, ReitMetrics>();
  for (const match of text.matchAll(/v_jj(\d{6})="([^"\n]*)"/g)) {
    const code = match[1],
      fields = match[2].split('~');
    const nav = positive(fields[5]),
      navDate = dateOnly(fields[8]);
    if (
      !/^(508\d{3}|180\d{3})$/.test(code) ||
      fields[0] !== code ||
      nav == null ||
      !navDate ||
      navDate > asOf
    )
      continue;
    const cumulative = positive(fields[6]);
    records.set(`${code.startsWith('508') ? 'sh' : 'sz'}${code}`, {
      nav,
      navDate,
      cumulativeNav: cumulative,
      source: 'tencent-fund',
      cashDistributionTtm: null,
      lastDistribution: null,
      lastDistributionDate: null,
      distributionCount: 0,
      coverageStart: navDate,
      asOfDate: asOf,
    });
  }
  return records;
}

export interface ReitDistributions {
  cashDistributionTtm: number | null;
  lastDistribution: number | null;
  lastDistributionDate: string | null;
  distributionCount: number;
  coverageStart: string;
  complete: boolean;
}
export function parseReitDistributionsPage(
  html: string,
  asOf = beijingDate(),
): ReitDistributions | null {
  const start = html.indexOf('成立以来，总计分红');
  if (start < 0) return null;
  const section = html.slice(start, start + 100000);
  const plain = (text: string) =>
    text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/g, ' ')
      .trim();
  const declaration = plain(section.slice(0, section.indexOf('</div>'))).match(
    /总计分红\s*(\d+)\s*次/,
  );
  const table = section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!declaration || table == null) return null;
  const total = Number(declaration[1]);
  const events = new Map<string, { date: string; amount: number }>();
  for (const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => plain(m[1]));
    const date = dateOnly(cells[0]);
    const amount = cells[1]?.replace(/\s/g, '').match(/每([\d.]+)份派(?:发)?现金([\d.]+)元/);
    if (!date || !amount) continue;
    const base = positive(amount[1]),
      cash = positive(amount[2]);
    if (base == null || cash == null) continue;
    const perUnit = cash / base;
    events.set(`${date}:${perUnit}`, { date, amount: perUnit });
  }
  const records = [...events.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (total > 0 && !records.length) return null;
  const cutoffDate = new Date(`${asOf}T00:00:00+08:00`);
  cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
  const cutoff = beijingDate(cutoffDate.getTime());
  const complete = records.length === total || (!!records[0] && records[0].date <= cutoff);
  const eligible = records.filter((r) => r.date <= asOf),
    ttm = eligible.filter((r) => r.date > cutoff);
  const last = eligible.at(-1);
  return {
    cashDistributionTtm: complete ? ttm.reduce((sum, r) => sum + r.amount, 0) : null,
    lastDistribution: last?.amount ?? null,
    lastDistributionDate: last?.date ?? null,
    distributionCount: ttm.length,
    coverageStart: records[0]?.date ?? asOf,
    complete,
  };
}
