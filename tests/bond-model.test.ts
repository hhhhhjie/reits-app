import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bondModelValuation,
  europeanCall,
  interpolateTreasury,
  validDate,
} from '../shared/bond-model';
import {
  createBondModelSource,
  dailyChangeVolatility,
  parseTreasury,
} from '../shared/bond-model-source';
import { demoQuote } from '../shared/demo';
import { parseBondTerms } from '../shared/fundamentals';
import { marketMetric } from '../shared/market-metrics';
import { emptyMarketFilters, matchesMarketFilters } from '../shared/screening';
import type { BondModelInputs, UniverseItem } from '../shared/types';

const day = '2026-10-23';
const item: UniverseItem = {
  symbol: 'sh113052',
  code: '113052',
  name: '测试转债',
  market: 'SH',
  type: 'bond',
  underlying: 'sh601166',
  bond: {
    ...parseBondTerms({
      TRANSFER_PRICE: 10,
      VALUE_DATE: '2021-10-23',
      EXPIRE_DATE: '2027-10-23',
      REDEEM_CLAUSE: '面值的110%(含最后一期利息)',
    }),
    pureBondValue: 100,
    pureBondDate: '2026-10-22',
  },
};
const bond = {
  ...demoQuote('sh113052')!,
  price: 105,
  source: 'tencent' as const,
  timestamp: `${day}T15:00:00+08:00`,
};
const stock = {
  ...demoQuote('sh601166')!,
  price: 10,
  dividendYield: 0,
  source: 'tencent' as const,
  timestamp: `${day}T15:00:00+08:00`,
};
const inputs: BondModelInputs = {
  symbol: stock.symbol,
  asOf: day,
  available: true,
  volatility: 20,
  volatilityStartDate: '2026-07-27',
  volatilityEndDate: '2026-10-22',
  returnCount: 60,
  treasuryCurve: [
    { years: 2, rate: 1.2 },
    { years: 5, rate: 1.5 },
    { years: 10, rate: 1.8 },
    { years: 30, rate: 2.2 },
  ],
  treasuryDate: '2026-10-22',
  fetchedAt: `${day}T08:00:00Z`,
  message: '测试参数',
};
function candles() {
  const end = Date.parse('2026-10-22T00:00:00Z');
  let close = 100;
  return Array.from({ length: 70 }, (_, i) => {
    close *= Math.exp(i % 2 ? 0.01 : -0.01);
    return {
      date: new Date(end - (69 - i) * 86400_000).toISOString().slice(0, 10),
      open: close,
      close,
      high: close,
      low: close,
      volume: 1000,
    };
  });
}
test('欧式期权与独立标准算例一致，分红、波动率、0波动和到期边界正确', () => {
  assert(Math.abs(europeanCall(100, 100, 1, 0.05, 0, 0.2)! - 10.4505835721856) < 0.00002);
  assert(Math.abs(europeanCall(100, 100, 1, 0.05, 0.03, 0.2)! - 8.6525285539427) < 0.00002);
  assert(europeanCall(100, 100, 1, 0.05, 0, 0.4)! > europeanCall(100, 100, 1, 0.05, 0, 0.2)!);
  assert.equal(europeanCall(120, 100, 1, 0, 0, 0), 20);
  assert.equal(europeanCall(80, 100, 1, 0, 0, 0), 0);
  assert.equal(europeanCall(120, 100, 0, 0.05, 0.1, 0.2), 20);
  assert.equal(europeanCall(100, 100, 1, 0, 0, -1), null);
  assert.equal(europeanCall(Infinity, 100, 1, 0, 0, 0.2), null);
});
test('60个真实日涨跌幅计算对数收益样本波动率，0与缺失、重复及陈旧历史区分', () => {
  const rows = candles()
    .slice(-60)
    .map((c, i) => ({
      SECURITY_CODE: '601166',
      TRADE_DATE: c.date,
      CHANGE_RATE: Math.expm1(i % 2 ? 0.01 : -0.01) * 100,
    }));
  const result = dailyChangeVolatility(rows, 'sh601166', day)!;
  assert.equal(result.returnCount, 60);
  assert.equal(result.endDate, '2026-10-22');
  assert(Math.abs(result.volatility - Math.sqrt(((60 * 0.01 ** 2) / 59) * 252) * 100) < 1e-9);
  assert.equal(dailyChangeVolatility(rows.slice(1), 'sh601166', day), null);
  assert.equal(dailyChangeVolatility([...rows.slice(1), rows[1]], 'sh601166', day), null);
  assert.equal(dailyChangeVolatility(rows, 'sh601166', '2026-11-30'), null);
  assert.equal(dailyChangeVolatility(rows, 'sh600519', day), null);
  for (const replacement of [{ CHANGE_RATE: null }, { CHANGE_RATE: -100 }, { TRADE_DATE: day }])
    assert.equal(
      dailyChangeVolatility([{ ...rows[0], ...replacement }, ...rows.slice(1)], 'sh601166', day),
      null,
    );
  assert.equal(
    dailyChangeVolatility(
      rows.map((r) => ({ ...r, CHANGE_RATE: 0 })),
      'sh601166',
      day,
    )?.volatility,
    0,
  );
});
test('国债字段为中国2/5/10/30年，短期限端点、插值、零值和日期校验正确', () => {
  const row = {
    SOLAR_DATE: '2026-10-22 00:00:00',
    EMM00588704: 1.2,
    EMM00166462: 1.5,
    EMM00166466: 1.8,
    EMM00166469: 2.2,
    EMG00001306: 9.9,
  };
  const parsed = parseTreasury(row, day)!;
  assert.deepEqual(
    parsed.curve.map((p) => p.years),
    [2, 5, 10, 30],
  );
  assert.equal(interpolateTreasury(parsed.curve, 1), 1.2);
  assert.equal(interpolateTreasury(parsed.curve, 3.5), 1.35);
  assert.equal(interpolateTreasury(parsed.curve, 5), 1.5);
  assert.equal(interpolateTreasury([{ years: 2, rate: 0 }], 1), 0);
  assert.equal(parseTreasury({ ...row, SOLAR_DATE: '2026-10-24' }, day), null);
  assert.equal(parseTreasury({ ...row, SOLAR_DATE: '2026-09-01' }, day), null);
  assert.equal(parseTreasury({ ...row, EMM00588704: null }, day), null);
  assert.equal(
    interpolateTreasury(
      [
        { years: 2, rate: 1 },
        { years: 2, rate: 2 },
      ],
      1,
    ),
    null,
  );
  for (const d of ['2026-02-29', '2026-13-01', '2026-00-01', 'bad'])
    assert.equal(validDate(d), false);
  assert.equal(validDate('2024-02-29'), true);
});
test('理论拆分、到期赎回金额与正负偏离度的金融含义一致，本机转股价可改变期权', () => {
  const v = bondModelValuation(item, bond, stock, undefined, inputs);
  assert.equal(v.pureBondValue, 100);
  assert(v.optionValue! > 0);
  assert.equal(v.theoreticalValue, 100 + v.optionValue!);
  assert(Math.abs(v.theoreticalDeviation! - (105 / v.theoreticalValue! - 1) * 100) < 1e-10);
  assert(v.optionValue! < europeanCall(100, 100, 1, Math.log1p(0.012), 0, 0.2)!); // 行权金额是含末息110，不是面值100
  const lowerConversion = bondModelValuation(item, bond, stock, 8, inputs);
  assert(lowerConversion.optionValue! > v.optionValue!);
  assert.equal(v.modelStrike, 110);
  const cheap = bondModelValuation(item, { ...bond, price: 50 }, stock, undefined, inputs);
  assert(cheap.theoreticalDeviation! < 0);
  const expensive = bondModelValuation(item, { ...bond, price: 200 }, stock, undefined, inputs);
  assert(expensive.theoreticalDeviation! > 0);
});
test('市场价减纯债价值不是模型期权；缺失、赎回、日期错配及演示参数不伪造理论值', () => {
  const v = bondModelValuation(item, bond, stock, undefined, inputs);
  assert.notEqual(v.optionValue, bond.price - 100);
  const noPure = bondModelValuation(
    { ...item, bond: { ...item.bond!, pureBondValue: null } },
    bond,
    stock,
    undefined,
    inputs,
  );
  assert(noPure.optionValue != null);
  assert.equal(noPure.theoreticalValue, null);
  assert.equal(noPure.theoreticalDeviation, null);
  for (const model of [
    undefined,
    { ...inputs, available: false },
    { ...inputs, returnCount: 5 },
    { ...inputs, asOf: '2026-10-22' },
    { ...inputs, treasuryDate: '2026-10-24' },
  ]) {
    const bad = bondModelValuation(item, bond, stock, undefined, model);
    assert.equal(bad.optionValue, null);
    assert.equal(bad.theoreticalValue, null);
    assert.equal(bad.pureBondValue, 100);
  }
  assert.equal(
    bondModelValuation(item, { ...bond, source: 'demo' }, stock, undefined, inputs).pureBondValue,
    null,
  );
  assert.equal(
    bondModelValuation(item, bond, { ...stock, dividendYield: null }, undefined, inputs)
      .optionValue,
    null,
  );
  assert.equal(
    bondModelValuation(
      item,
      bond,
      { ...stock, timestamp: '2026-10-22T15:00:00+08:00' },
      undefined,
      inputs,
    ).optionValue,
    null,
  );
  assert.equal(
    bondModelValuation(
      { ...item, bond: { ...item.bond!, redeemNoticeDate: '2026-10-20' } },
      bond,
      stock,
      undefined,
      inputs,
    ).optionValue,
    null,
  );
  assert.equal(
    bondModelValuation(
      { ...item, bond: { ...item.bond!, pureBondDate: '2026-10-24' } },
      bond,
      stock,
      undefined,
      inputs,
    ).theoreticalValue,
    null,
  );
  assert.equal(
    bondModelValuation(
      { ...item, bond: { ...item.bond!, maturityDate: day } },
      bond,
      stock,
      undefined,
      inputs,
    ).optionValue,
    null,
  );
});
test('纯债、期权和理论偏离指标支持组合区间，缺失与0不同、负偏离与边界保留', () => {
  const quotes = { [bond.symbol]: bond, [stock.symbol]: stock };
  const v = bondModelValuation(item, bond, stock, undefined, inputs);
  assert.equal(marketMetric(item, 'pureBondValue', quotes), 100);
  const f = {
    ...emptyMarketFilters(),
    ranges: {
      pureBondValue: { min: '100', max: '100' },
      theoreticalDeviation: {
        min: String(v.theoreticalDeviation),
        max: String(v.theoreticalDeviation),
      },
    },
  };
  assert(matchesMarketFilters(item, f, 'bond', quotes, [], {}, undefined, inputs));
  assert(!matchesMarketFilters(item, f, 'bond', quotes, [], {}, undefined, undefined));
  const zero = { ...inputs, volatility: 0 };
  assert.equal(bondModelValuation(item, bond, stock, undefined, zero).optionValue, 0);
  assert(
    matchesMarketFilters(
      item,
      { ...emptyMarketFilters(), ranges: { optionValue: { min: '0', max: '0' } } },
      'bond',
      quotes,
      [],
      {},
      undefined,
      zero,
    ),
  );
});
test('日终纯债源完整分页并保留原始日期，重复或缺页不得冒充估值', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse(`${day}T08:00:00Z`));
  const rows = Array.from({ length: 501 }, (_, i) => ({
    DATE: '2026-10-22',
    ZCODE: String(110000 + i),
    SECUCODE: `${110000 + i}.SH`,
    PUREBONDVALUE: 90 + i / 100,
  }));
  let fail = false;
  const source = createBondModelSource(
    async (url) => {
      const u = new URL(url),
        page = Number(u.searchParams.get('pageNumber'));
      if (u.searchParams.get('pageSize') === '1')
        return JSON.stringify({
          success: true,
          result: { data: [rows[0]], pages: 99999, count: 99999 },
        });
      if (page === 2 && fail) throw new Error('offline');
      return JSON.stringify({
        success: true,
        result: { data: rows.slice((page - 1) * 500, page * 500), pages: 2, count: 501 },
      });
    },
    () => false,
  );
  const result = await source.getPureBondValues(day);
  assert.equal(result.available, true);
  assert.equal(Object.keys(result.values).length, 501);
  assert.equal(result.date, '2026-10-22');
  fail = true;
  const missing = await source.getPureBondValues('2026-10-22');
  assert.equal(missing.available, false);
  assert.deepEqual(missing.values, {});
});
test('真实涨跌幅历史和利率共享缓存，演示模式不请求估值参数，非法代码与未来日期被拒绝', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse(`${day}T08:00:00Z`));
  let historyCalls = 0,
    rateCalls = 0;
  const source = createBondModelSource(
    async (url) => {
      const params = new URL(url).searchParams;
      if (params.get('reportName') === 'RPT_VALUEANALYSIS_DET') {
        historyCalls++;
        const code = params.get('filter')!.match(/SECURITY_CODE="(\d{6})"/)![1];
        return JSON.stringify({
          success: true,
          result: {
            data: candles()
              .slice(-60)
              .map((c, i) => ({
                SECURITY_CODE: code,
                TRADE_DATE: c.date,
                CHANGE_RATE: Math.expm1(i % 2 ? 0.01 : -0.01) * 100,
              })),
          },
        });
      }
      rateCalls++;
      return JSON.stringify({
        success: true,
        result: {
          data: [
            {
              SOLAR_DATE: '2026-10-22',
              EMM00588704: 1.2,
              EMM00166462: 1.5,
              EMM00166466: 1.8,
              EMM00166469: 2.2,
            },
          ],
        },
      });
    },
    () => false,
  );
  const [a, b] = await Promise.all([
    source.getBondModelInputs('sh601166', day),
    source.getBondModelInputs('sh601166', day),
  ]);
  assert(a.available);
  assert.equal(a.volatilitySource, 'eastmoney-daily-change');
  assert.equal(a, b);
  assert.equal(historyCalls, 1);
  assert.equal(rateCalls, 1);
  await source.getBondModelInputs('sh600519', day);
  assert.equal(rateCalls, 1);
  await assert.rejects(source.getBondModelInputs('hk00700', day));
  await assert.rejects(source.getBondModelInputs('sh601166', '2026-10-24'));
  const demo = createBondModelSource(
    async () => {
      throw new Error('No source in demo');
    },
    () => true,
  );
  const none = await demo.getBondModelInputs('sh601166', day);
  assert.equal(none.available, false);
  assert.equal(none.volatility, null);
  assert.deepEqual(none.treasuryCurve, []);
});
