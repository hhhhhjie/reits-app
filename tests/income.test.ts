import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketSource } from '../shared/source';
import { readIncomeDirectory } from '../shared/income';
import { HK_REITS, searchCatalog } from '../shared/catalog';
import { parseQuotes } from '../shared/parsers';
import {
  emptyIncomeFilters,
  incomeFilterError,
  matchesIncomeFilters,
  readIncomeFilters,
} from '../shared/income-screening';
import type { Instrument } from '../shared/types';

function qt(symbol: string, overrides: Record<number, string> = {}) {
  const hk = symbol.startsWith('hk'),
    f = Array(88).fill('');
  Object.assign(f, {
    0: hk ? '100' : '1',
    1: `测试${symbol}`,
    2: symbol.slice(2),
    3: '10',
    4: '9.5',
    5: '9.8',
    30: hk ? '2026/10/19 16:08:00' : '20261019150000',
    33: '10.2',
    34: '9.7',
    37: '1234',
    38: '99',
    39: '8',
    45: '10',
    46: hk ? 'ENGLISH NAME' : '0.8',
    47: hk ? '6' : '11',
    58: hk ? '0.8' : '0',
    59: hk ? '0.2' : '0',
    61: hk ? '' : 'GP-A',
    63: hk ? 'GP' : '999',
    64: hk ? '88' : '6',
    70: '12345',
    72: hk ? '0.6' : '100000000',
    75: hk ? 'HKD' : '888',
    82: hk ? '' : 'CNY',
    ...overrides,
  });
  return `v_${symbol}="${f.join('~')}";`;
}
function aRow(i: number) {
  const code = String(600100 + i);
  return {
    SECURITY_CODE: code,
    SECUCODE: `${code}.SH`,
    SECURITY_NAME_ABBR: `分页${i}`,
    TRADE_DATE: '2026-10-19 00:00:00',
  };
}
test('股息扩展协议按市场解码，金额、百分数、CNY港股与REITs分类正确', () => {
  const [a, hk, rmb] = parseQuotes(
    qt('sh600519') + qt('hk00700') + qt('hk87001', { 63: 'GP-FUND-REITS', 75: 'CNY' }),
  );
  assert.equal(a.dividendYield, 6);
  assert.equal(hk.dividendYield, 6);
  assert.equal((hk.dividendPerShare! / hk.price) * 100, hk.dividendYield);
  assert.equal(a.turnover, 12340000);
  assert.equal(hk.turnover, 1234);
  assert.equal(hk.turnoverRate, 0.2); // 不能把占位的38读作99%换手率
  assert.equal(hk.marketCap, 1000000000);
  assert.equal(hk.pb, 0.8);
  assert.equal(rmb.currency, 'CNY');
  assert.equal(rmb.type, 'reit');
  assert.equal(rmb.securityClass, 'GP-FUND-REITS');
  assert.equal(a.dividendPerShare, null); // 不把A股股本误读为每股股息
});
test('创业板、科创板协议也提供股息，缺失不作0、明确0保留、负PE不抹除', () => {
  const [cyb, kcb, missing, zero, old] = parseQuotes(
    qt('sz300001', { 61: 'GP-A-CYB', 39: '-12' }) +
      qt('sh688001', { 61: 'GP-A-KCB' }) +
      qt('hk00700', { 47: '--', 72: '' }) +
      qt('sh600036', { 64: '0' }) +
      qt('sh601398', { 82: '' }),
  );
  assert.equal(cyb.dividendYield, 6);
  assert.equal(kcb.dividendYield, 6);
  assert.equal(cyb.pe, -12);
  assert.equal(missing.dividendYield, null);
  assert.equal(missing.dividendPerShare, null);
  assert.equal(zero.dividendYield, 0);
  assert.equal(old.dividendYield, null);
});
test('A股目录固定最新交易日，完成500条后的分页并分批报价，缺价品种保留', async () => {
  const rows = Array.from({ length: 525 }, (_, i) => aRow(i));
  const seen: number[] = [],
    sizes: number[] = [];
  const source = createMarketSource(async (url) => {
    const u = new URL(url);
    if (u.hostname === 'datacenter-web.eastmoney.com') {
      const pn = Number(u.searchParams.get('pageNumber'));
      if (u.searchParams.get('pageSize') === '1')
        return JSON.stringify({
          success: true,
          result: { pages: 525, count: 525, data: [rows[0]] },
        });
      assert.equal(u.searchParams.get('filter'), "(TRADE_DATE='2026-10-19')");
      seen.push(pn);
      return JSON.stringify({
        success: true,
        result: { pages: 2, count: 525, data: rows.slice((pn - 1) * 500, pn * 500) },
      });
    }
    const syms = url.split('q=')[1].split(',');
    sizes.push(syms.length);
    return syms
      .filter((s) => s !== 'sh600624')
      .map((s) => qt(s))
      .join('\n');
  });
  const result = await source.getIncome('a');
  assert.equal(result.directoryComplete, true);
  assert.equal(result.items.length, 525);
  assert.equal(result.quotes.length, 524);
  assert.equal(result.mode, 'live');
  assert.deepEqual(seen, [1, 2]);
  assert(sizes.every((n) => n <= 150));
  assert(result.items.some((i) => i.symbol === 'sh600624'));
  assert.match(result.message, /1只报价暂缺/);
});
test('目录重复、计数漂移和缺页失败，均不能把部分数据标作完整', async () => {
  for (const failure of ['duplicate', 'drift', 'offline']) {
    const request = async (url: string) => {
      const pn = Number(new URL(url).searchParams.get('pageNumber'));
      if (pn === 2 && failure === 'offline') throw new Error('offline');
      return JSON.stringify({
        success: true,
        result: {
          pages: 2,
          count: pn === 2 && failure === 'drift' ? 3 : 2,
          data: [
            {
              SECURITY_CODE: pn === 2 && failure !== 'duplicate' ? '00700' : '00001',
              SECUCODE: pn === 2 && failure !== 'duplicate' ? '00700.HK' : '00001.HK',
              SECURITY_NAME_ABBR: '测试',
            },
          ],
        },
      });
    };
    await assert.rejects(readIncomeDirectory(request, 'hk'));
  }
  const failed = await createMarketSource(async () => {
    throw new Error('offline');
  }).getIncome('hk');
  assert.equal(failed.directoryComplete, false);
  assert.equal(failed.mode, 'demo');
  assert.deepEqual(failed.quotes, []);
  assert.match(failed.message, /不生成演示股息率/);
});
test('港股公司目录读完源覆盖；维护的REITs仅接受源端REITS类型、不宣称全市场', async () => {
  const source = createMarketSource(async (url) => {
    if (url.includes('datacenter-web'))
      return JSON.stringify({
        success: true,
        result: {
          pages: 1,
          count: 1,
          data: [{ SECURITY_CODE: '00700', SECUCODE: '00700.HK', SECURITY_NAME_ABBR: '腾讯控股' }],
        },
      });
    return url
      .split('q=')[1]
      .split(',')
      .map((s) =>
        qt(s, {
          63: s === 'hk00405' ? 'GP' : 'GP-FUND-REITS',
          75: s === 'hk87001' ? 'CNY' : 'HKD',
        }),
      )
      .join('');
  });
  const hk = await source.getIncome('hk');
  assert.equal(hk.items.length, 1);
  assert.match(hk.message, /不等于全部港交所证券/);
  const reits = await source.getIncome('hkreit');
  assert.equal(reits.items.length, 10);
  assert.equal(reits.quotes.length, 9);
  assert.equal(reits.directoryComplete, false);
  assert.match(reits.message, /维护名单/);
  assert.equal(reits.quotes.find((q) => q.symbol === 'hk87001')?.currency, 'CNY');
  assert.equal(HK_REITS.length, 10);
  assert(searchCatalog('领展').some((i) => i.symbol === 'hk00823'));
});
test('更新失败保持旧报价时间和缓存标记，不生成股息率', async (t) => {
  let time = Date.parse('2026-10-19T08:00:00Z'),
    fail = false;
  t.mock.method(Date, 'now', () => time);
  const source = createMarketSource(async (url) => {
    if (fail) throw new Error('offline');
    if (url.includes('datacenter-web'))
      return JSON.stringify({
        success: true,
        result: {
          pages: 1,
          count: 1,
          data: [{ SECURITY_CODE: '00700', SECUCODE: '00700.HK', SECURITY_NAME_ABBR: '腾讯控股' }],
        },
      });
    return qt('hk00700');
  });
  const live = await source.getIncome('hk');
  fail = true;
  time += 31 * 60_000;
  const cached = await source.getIncome('hk');
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.directoryComplete, false);
  assert.equal(cached.quotes[0].timestamp, live.quotes[0].timestamp);
  assert.equal(cached.quotes[0].dividendYield, 6);
  await assert.rejects(source.getIncome('all' as 'a'));
});
test('股息筛选联合区间、自选、正PE，0和缺失不同，负PB和全角百分数有效', () => {
  const item: Instrument = {
    symbol: 'hk00700',
    code: '00700',
    name: '测试',
    type: 'stock',
    market: 'HK',
  };
  const [q] = parseQuotes(qt(item.symbol));
  const f = {
    ...emptyIncomeFilters(),
    ranges: {
      dividendYield: { min: '６％', max: '6' },
      price: { min: '10', max: '10' },
      pb: { min: '-1', max: '1' },
    },
  };
  assert.equal(incomeFilterError(f), '');
  assert(matchesIncomeFilters(item, q, f, []));
  assert(!matchesIncomeFilters(item, { ...q, dividendYield: null }, f, []));
  assert(!matchesIncomeFilters(item, q, { ...f, watchOnly: true }, []));
  assert(
    matchesIncomeFilters(
      item,
      { ...q, dividendYield: 0 },
      { ...emptyIncomeFilters(), ranges: { dividendYield: { min: '0', max: '0' } } },
      [],
    ),
  );
  assert(!matchesIncomeFilters(item, { ...q, pe: -1 }, { ...f, profitableOnly: true }, []));
  assert(matchesIncomeFilters(item, undefined, emptyIncomeFilters(), []));
});
test('股息区间与本机配置拒绝无效数值、倒置范围和未知字段', () => {
  for (const range of [
    { min: '%', max: '' },
    { min: 'NaN', max: '' },
    { min: '5', max: '4' },
    { min: '-1', max: '' },
  ])
    assert(incomeFilterError({ ...emptyIncomeFilters(), ranges: { dividendYield: range } }));
  assert.deepEqual(readIncomeFilters(null), emptyIncomeFilters());
  assert.equal(readIncomeFilters('{bad'), null);
  assert.equal(
    readIncomeFilters(
      JSON.stringify({ ...emptyIncomeFilters(), ranges: { temperature: { min: '0', max: '' } } }),
    ),
    null,
  );
  const valid = {
    ...emptyIncomeFilters(),
    watchOnly: true,
    ranges: { pe: { min: '-20', max: '15' } },
  };
  assert.deepEqual(readIncomeFilters(JSON.stringify(valid)), valid);
});
