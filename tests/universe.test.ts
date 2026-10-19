import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketSource } from '../shared/source';
import {
  parseBondDirectory,
  parseBondTerms,
  parseReitFundHistory,
  parseTencentFundNAV,
  parseReitDistributionsPage,
} from '../shared/fundamentals';
import { bondYieldToMaturity } from '../shared/valuation';
import { marketMetric } from '../shared/market-metrics';
import { demoQuote } from '../shared/demo';

function bondRow(index = 0) {
  return {
    SECURITY_CODE: String(113700 + index),
    SECUCODE: `${113700 + index}.SH`,
    SECURITY_NAME_ABBR: `测试${index}转债`,
    LISTING_DATE: '2024-01-02 00:00:00',
    DELIST_DATE: null,
    CONVERT_STOCK_CODE: '600519',
    SECURITY_SHORT_NAME: '贵州茅台',
    RATING: 'AA+',
    VALUE_DATE: '2023-01-01 00:00:00',
    EXPIRE_DATE: '2029-01-01 00:00:00',
    ACTUAL_ISSUE_SCALE: 12,
    TRANSFER_PRICE: 10,
    REDEEM_CLAUSE:
      '到期赎回条款：以票面面值的110%(含最后一期利息)赎回。有条件赎回价格按面值100%加利息。',
    INTEREST_RATE_EXPLAIN:
      '第一年0.2%、第二年0.4%、第三年0.6%、第四年1.5%、第五年1.8%、第六年2.0%。',
    REDEEM_TRIG_PRICE: 13,
    RESALE_TRIG_PRICE: 7,
    NOTICE_DATE_SH: null,
  };
}
function quote(symbol: string) {
  const fields = Array(66).fill('');
  Object.assign(fields, {
    0: '1',
    1: `证券${symbol}`,
    2: symbol.slice(2),
    3: '110',
    4: '100',
    5: '101',
    30: '20261019150000',
    33: '112',
    34: '99',
  });
  return `v_${symbol}="${fields.join('~')}";`;
}

test('转债全市场逐页加载，超过150只分批报价，不遗漏无报价记录', async () => {
  const rows = Array.from({ length: 225 }, (_, i) => bondRow(i));
  const pages: number[] = [],
    batches: number[] = [];
  const source = createMarketSource(async (url) => {
    const u = new URL(url);
    if (u.hostname === 'datacenter-web.eastmoney.com') {
      const page = Number(u.searchParams.get('pageNumber'));
      pages.push(page);
      return JSON.stringify({
        success: true,
        result: { pages: 2, count: 225, data: rows.slice((page - 1) * 200, page * 200) },
      });
    }
    const symbols = url.split('q=')[1].split(',');
    batches.push(symbols.length);
    // 最后一只没有报价，仍必须出现在完整目录。
    return symbols
      .filter((s) => s !== 'sh113924')
      .map(quote)
      .join('\n');
  });
  const data = await source.getUniverse('bond');
  assert.equal(data.complete, true);
  assert.equal(data.total, 225);
  assert.equal(data.items.length, 225);
  assert.deepEqual(pages.sort(), [1, 2]);
  assert(batches.every((size) => size <= 150));
  assert(data.items.some((item) => item.symbol === 'sh113924'));
  assert(!data.quotes.some((q) => q.symbol === 'sh113924'));
  assert.match(data.message, /1只行情暂缺/);
  assert.equal(data.quotes.find((q) => q.symbol === 'sh113700')?.underlying, 'sh600519');
});
test('目录页数或计数不一致时不能标为全市场，失败后保留上次数据', async (t) => {
  let time = Date.parse('2026-10-19T08:00:00Z'),
    fail = false;
  t.mock.method(Date, 'now', () => time);
  const source = createMarketSource(async (url) => {
    if (url.includes('datacenter-web')) {
      if (fail) throw new Error('offline');
      return JSON.stringify({ success: true, result: { pages: 1, count: 1, data: [bondRow()] } });
    }
    return url.split('q=')[1].split(',').map(quote).join('\n');
  });
  const good = await source.getUniverse('bond');
  fail = true;
  time += 301_000;
  const cached = await source.getUniverse('bond');
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.complete, false);
  assert.equal(cached.directoryUpdatedAt, good.directoryUpdatedAt);
  assert.equal(cached.items.length, 1);
  const inconsistent = createMarketSource(async () =>
    JSON.stringify({ success: true, result: { pages: 1, count: 2, data: [bondRow()] } }),
  );
  const fallback = await inconsistent.getUniverse('bond');
  assert.equal(fallback.complete, false);
  assert.equal(fallback.total, null);
  assert.equal(fallback.mode, 'demo');
});
test('仅保留已上市未退市可转债，待上市、未来上市、可交换债被排除', () => {
  const base = bondRow();
  const rows = [
    base,
    { ...base, LISTING_DATE: null },
    { ...base, LISTING_DATE: '2027-01-01' },
    { ...base, DELIST_DATE: '2026-10-01' },
    { ...base, SECURITY_NAME_ABBR: '26测试EB' },
    { ...base, SECURITY_CODE: '132001', SECUCODE: '132001.SH' },
  ];
  const items = parseBondDirectory(rows, '2026-10-19');
  assert.equal(items.length, 1);
  assert.equal(items[0].bond?.conversionPrice, 10);
  assert.equal(items[0].bond?.redemptionPrice, 110);
  assert.deepEqual(items[0].bond?.couponRates, [0.2, 0.4, 0.6, 1.5, 1.8, 2]);
});
test('REITs目录超过100只时完整分页，不能截断到首页', async () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({
    f12: String(508000 + i),
    f13: 1,
    f14: `全量${i}REIT`,
  }));
  const seen: number[] = [];
  const source = createMarketSource(async (url) => {
    if (url.includes('95.push2')) {
      const pn = Number(new URL(url).searchParams.get('pn'));
      seen.push(pn);
      return JSON.stringify({ data: { total: 125, diff: rows.slice((pn - 1) * 100, pn * 100) } });
    }
    if (url.includes('q=jj')) return '';
    return url.split('q=')[1].split(',').map(quote).join('\n');
  });
  const result = await source.getUniverse('reit');
  assert.equal(result.total, 125);
  assert.equal(result.complete, true);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.items.at(-1)?.symbol, 'sh508124');
});
test('REITs备用目录核验整个代码段；任何一批失败均不得宣称完整', async () => {
  const seen = new Set<string>();
  const source = createMarketSource(async (url) => {
    if (url.includes('95.push2')) throw new Error('not reachable');
    const symbols = url.split('q=')[1].split(',');
    if (symbols[0].startsWith('jj')) return '';
    symbols.forEach((s) => seen.add(s));
    return symbols
      .filter((s) => ['sh508999', 'sz180999'].includes(s))
      .map(quote)
      .join('\n');
  });
  const data = await source.getUniverse('reit');
  assert.equal(seen.size, 2000);
  assert.equal(data.complete, true);
  assert.equal(data.total, 2);
  assert(data.items.some((i) => i.symbol === 'sh508999'));
  assert(data.items.some((i) => i.symbol === 'sz180999'));
  const broken = createMarketSource(async (url) => {
    if (url.includes('95.push2') || url.includes('sh508150')) throw new Error('one page failed');
    return quote('sh508000');
  });
  assert.equal((await broken.getUniverse('reit')).complete, false);
});
test('税前YTM末期利息只计一次，负收益正常，赎回公告及缺失条款不估算', () => {
  const terms = {
    ...parseBondTerms(bondRow()),
    issueDate: '2025-01-01',
    maturityDate: '2026-01-01',
    couponRates: [5],
    redemptionPrice: 105,
  };
  assert(Math.abs(bondYieldToMaturity(terms, 100, '2025-01-01')! - 5) < 1e-8);
  assert(bondYieldToMaturity(terms, 110, '2025-01-01')! < 0);
  assert.equal(
    bondYieldToMaturity({ ...terms, redeemNoticeDate: '2025-12-01' }, 100, '2025-01-01'),
    null,
  );
  assert.equal(bondYieldToMaturity({ ...terms, couponRates: [] }, 100, '2025-01-01'), null);
  assert.equal(bondYieldToMaturity(terms, 100, '2026-01-01'), null);
  assert.equal(
    parseBondTerms({ ...bondRow(), REDEEM_CLAUSE: '有条件赎回价格为面值130%' }).redemptionPrice,
    null,
  );
});
test('自动转股价计算可被本机修正覆盖；缺失正股及混合来源不计算', () => {
  const bond = { ...demoQuote('sh113052')!, price: 110, underlying: 'sh601166' };
  const stock = { ...demoQuote('sh601166')!, price: 12 };
  const item = { ...bond, bond: { ...parseBondTerms(bondRow()), conversionPrice: 10 } };
  const quotes = { [bond.symbol]: bond, [stock.symbol]: stock };
  assert.equal(marketMetric(item, 'conversionValue', quotes), 120);
  assert.equal(marketMetric(item, 'conversionValue', quotes, 12), 100);
  assert.equal(marketMetric(item, 'conversionValue', { [bond.symbol]: bond }), null);
  assert.equal(
    marketMetric(item, 'conversionValue', {
      ...quotes,
      [stock.symbol]: { ...stock, source: 'tencent' },
    }),
    null,
  );
});
test('披露净值使用jj协议已披露字段及其日期，不使用0估值或累计净值作单位净值', () => {
  const parsed = parseTencentFundNAV(
    'v_jj508056="508056~中金普洛斯REIT~0.0000~0.0000~~3.1146~3.9311~-1.3087~2026-06-30~";',
    '2026-10-19',
  );
  const value = parsed.get('sh508056')!;
  assert.equal(value.nav, 3.1146);
  assert.equal(value.cumulativeNav, 3.9311);
  assert.equal(value.navDate, '2026-06-30');
  assert.equal(value.cashDistributionTtm, null);
  assert.equal(
    parseTencentFundNAV('v_jj508056="508056~REIT~~~~3.1~3.9~~2027-01-01~";', '2026-10-19').size,
    0,
  );
});
test('分红按北京记录日统计近12月现金，排除未来与重复记录，缺数据不写零', () => {
  const row = (date: string, unitMoney: string, y = 3) => ({
    x: Date.parse(`${date}T00:00:00+08:00`),
    y,
    unitMoney,
  });
  const data = [
    row('2024-01-01', ''),
    row('2025-10-19', '每份派现金0.8元'),
    row('2026-01-01', '每份派现金0.1元'),
    row('2026-01-01', '每份派现金0.1元'),
    row('2026-10-19', '每份派现金0.2元', 3.2),
    row('2026-10-20', '每份派现金9元'),
  ];
  const parsed = parseReitFundHistory(
    `var Data_netWorthTrend = ${JSON.stringify(data)};`,
    '2026-10-19',
  )!;
  assert.equal(parsed.nav, 3.2);
  assert.equal(parsed.navDate, '2026-10-19');
  assert(Math.abs(parsed.cashDistributionTtm! - 0.3) < 1e-10);
  assert.equal(parsed.distributionCount, 2);
  assert.equal(parsed.lastDistributionDate, '2026-10-19');
  assert.equal(
    parseReitFundHistory(
      `var Data_netWorthTrend = ${JSON.stringify([row('2026-10-19', '')])};`,
      '2026-10-19',
    )!.cashDistributionTtm,
    null,
  );
  assert.equal(
    parseReitFundHistory('var Data_netWorthTrend = (()=>{throw Error("never execute")})();'),
    null,
  );
});
test('演示模式和错误净值源不编造目录总数或现金分红', async () => {
  const source = createMarketSource(
    async () => {
      throw new Error('offline');
    },
    () => true,
  );
  const result = await source.getUniverse('bond');
  assert.equal(result.total, null);
  assert.equal(result.complete, false);
  assert.equal(result.mode, 'demo');
  const metrics = await source.getReitMetrics('sh508056');
  assert.equal(metrics.available, false);
  assert.equal(metrics.metrics, null);
  await assert.rejects(() => source.getUniverse('stock' as 'bond'));
  await assert.rejects(() => source.getReitMetrics('sh600519'));
});

test('现金分红表每10份换算为每份，近12月覆盖不足不计算分派率', () => {
  const html = (count: number, rows: [string, string][]) =>
    `<div>成立以来，总计分红<a>${count}</a>次，拆分0次</div><table>${rows.map(([date, value]) => `<tr><td>${date}</td><td>每10份派现金<span>${value}</span>元</td></tr>`).join('')}</table>`;
  const result = parseReitDistributionsPage(
    html(3, [
      ['2026-09-17', '0.5152'],
      ['2026-04-16', '0.5486'],
      ['2025-09-18', '0.6248'],
    ]),
    '2026-10-19',
  )!;
  assert.equal(result.complete, true);
  assert(Math.abs(result.cashDistributionTtm! - 0.10638) < 1e-12);
  assert.equal(result.distributionCount, 2);
  assert.equal(result.lastDistributionDate, '2026-09-17');
  assert.equal(
    parseReitDistributionsPage(html(12, [['2026-09-17', '0.5152']]), '2026-10-19')!
      .cashDistributionTtm,
    null,
  );
  assert.equal(parseReitDistributionsPage('<html>数据暂不可用</html>'), null);
  assert.equal(parseReitDistributionsPage(html(0, []), '2026-10-19')!.cashDistributionTtm, 0);
});
