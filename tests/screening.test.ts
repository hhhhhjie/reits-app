import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFilterChips,
  boundNumber,
  canonicalFilters,
  clearFilter,
  decodeFilterPreferences,
  emptyFilterPreferences,
  emptyMarketFilters,
  filterErrors,
  matchesMarketFilters,
  upsertFilterPreset,
  type MarketFilters,
} from '../shared/screening';
import { demoQuote } from '../shared/demo';
import { parseBondTerms } from '../shared/fundamentals';
import type { Quote, ReitMetrics, UniverseItem } from '../shared/types';

const bond: UniverseItem = {
  symbol: 'sh113052',
  code: '113052',
  name: '兴业转债',
  market: 'SH',
  type: 'bond',
  underlying: 'sh601166',
  bond: {
    ...parseBondTerms({
      TRANSFER_PRICE: 10,
      RATING: 'AA+',
      ACTUAL_ISSUE_SCALE: 20,
      VALUE_DATE: '2023-01-01',
      EXPIRE_DATE: '2029-01-01',
    }),
    stockName: '兴业银行',
  },
};
const quotes: Record<string, Quote> = {
  sh113052: { ...demoQuote('sh113052')!, price: 110, turnover: 12500000, changePercent: 1.5 },
  sh601166: { ...demoQuote('sh601166')!, price: 12 },
};
const reit: UniverseItem = {
  symbol: 'sh508056',
  code: '508056',
  name: '中金普洛斯REIT',
  market: 'SH',
  type: 'reit',
};
const nav: ReitMetrics = {
  nav: 3,
  navDate: '2026-06-30',
  cumulativeNav: 3.8,
  source: 'mixed',
  cashDistributionTtm: 0.3,
  lastDistribution: 0.1,
  lastDistributionDate: '2026-09-17',
  distributionCount: 3,
  coverageStart: '2021-01-01',
  asOfDate: '2026-10-19',
};
const rq: Record<string, Quote> = {
  sh508056: {
    ...demoQuote('sh508056')!,
    price: 2.7,
    turnover: 30000000,
    marketCap: 1800000000,
    source: 'tencent',
  },
};
const match = (filters: MarketFilters, item = bond, q = quotes) =>
  matchesMarketFilters(item, filters, 'bond', q, [], {});

test('多个范围、评级和市场组合为AND，支持负溢价与闭区间', () => {
  const filters = {
    ...emptyMarketFilters(),
    market: 'SH' as const,
    ratings: ['AA+', 'AAA'],
    ranges: { price: { min: '110', max: '110' }, premium: { min: '-10', max: '0' } },
  };
  assert(match(filters)); // 110/120-1 = -8.3333%
  assert(!match({ ...filters, market: 'SZ' }));
  assert(!match({ ...filters, ratings: ['AA'] }));
  assert(!match({ ...filters, ranges: { ...filters.ranges, premium: { min: '0', max: '30' } } }));
  assert(!match({ ...filters, watchOnly: true }));
  assert(
    matchesMarketFilters(bond, { ...filters, watchOnly: true }, 'bond', quotes, [bond.symbol], {}),
  );
});
test('空条件保留无报价品种，已启用指标缺失时排除，数值0不视为缺失', () => {
  assert(match(emptyMarketFilters(), bond, {}));
  assert(!match({ ...emptyMarketFilters(), ranges: { price: { min: '0', max: '' } } }, bond, {}));
  const filters = {
    ...emptyMarketFilters(),
    ranges: { distributionYield: { min: '0', max: '0' } },
  };
  assert(
    matchesMarketFilters(reit, filters, 'reit', rq, [], {}, { ...nav, cashDistributionTtm: 0 }),
  );
  assert(
    !matchesMarketFilters(reit, filters, 'reit', rq, [], {}, { ...nav, cashDistributionTtm: null }),
  );
});
test('万元和亿元转换正确，不误用剩余规模；本机转股价参与筛选', () => {
  assert(
    match({
      ...emptyMarketFilters(),
      ranges: { turnover: { min: '1250', max: '1250' }, issueScale: { min: '20', max: '20' } },
    }),
  );
  assert(!match({ ...emptyMarketFilters(), ranges: { turnover: { min: '1251', max: '' } } }));
  assert(
    matchesMarketFilters(
      reit,
      { ...emptyMarketFilters(), ranges: { marketCap: { min: '18', max: '18' } } },
      'reit',
      rq,
      [],
      {},
      nav,
    ),
  );
  const filters = {
    ...emptyMarketFilters(),
    ranges: { conversionValue: { min: '100', max: '100' } },
  };
  assert(!match(filters));
  assert(matchesMarketFilters(bond, filters, 'bond', quotes, [], { sh113052: 12 }));
});
test('净值折价与历史分派率可组合，浮点误差不破坏包含边界', () => {
  const filters = {
    ...emptyMarketFilters(),
    ranges: { navPremium: { min: '-10', max: '-10' }, distributionYield: { min: '10', max: '12' } },
  };
  assert(matchesMarketFilters(reit, filters, 'reit', rq, [], {}, nav));
  assert(
    !matchesMarketFilters(
      reit,
      { ...filters, ranges: { ...filters.ranges, navPremium: { min: '0', max: '' } } },
      'reit',
      rq,
      [],
      {},
      nav,
    ),
  );
});
test('数字输入校验接受规范百分号和全角数字，拒绝无效值和倒置范围', () => {
  assert.equal(boundNumber('１２０．５'), 120.5);
  assert.equal(boundNumber('−１０％', true), -10);
  assert.equal(boundNumber('1,200'), 1200);
  assert.equal(boundNumber('1,5'), null);
  for (const value of ['NaN', 'Infinity', '0x10', 'abc', '--', '%'])
    assert(
      filterErrors(
        { ...emptyMarketFilters(), ranges: { premium: { min: value, max: '' } } },
        'bond',
      ).premium,
    );
  assert.match(
    filterErrors({ ...emptyMarketFilters(), ranges: { price: { min: '200', max: '100' } } }, 'bond')
      .price,
    /最低值不能大于最高值/,
  );
  assert.match(
    filterErrors({ ...emptyMarketFilters(), ranges: { yearsLeft: { min: '-1', max: '' } } }, 'bond')
      .yearsLeft,
    /不能小于0/,
  );
  const canonical = canonicalFilters(
    {
      ...emptyMarketFilters(),
      ranges: { premium: { min: ' −１０％ ', max: ' ３０% ' }, price: { min: '', max: '' } },
    },
    'bond',
  );
  assert.deepEqual(canonical.ranges, { premium: { min: '-10', max: '30' } });
});
test('赎回只按公告字段筛选，ST只按已标记正股名，不改变评级缺失语义', () => {
  const announced = { ...bond, bond: { ...bond.bond!, redeemNoticeDate: '2026-10-01' } };
  assert(!match({ ...emptyMarketFilters(), redemption: 'exclude_announced' }, announced));
  assert(match({ ...emptyMarketFilters(), redemption: 'only_announced' }, announced));
  assert(!match({ ...emptyMarketFilters(), redemption: 'only_announced' }));
  assert(
    !match(
      { ...emptyMarketFilters(), excludeST: true },
      { ...bond, bond: { ...bond.bond!, stockName: '*ST测试' } },
    ),
  );
  assert(
    match(
      { ...emptyMarketFilters(), ratings: ['未评级'] },
      { ...bond, bond: { ...bond.bond!, rating: null } },
    ),
  );
});
test('清除单项不删除其他条件；标签准确反映负数和单位', () => {
  const filters = {
    ...emptyMarketFilters(),
    watchOnly: true,
    ratings: ['AA+'],
    ranges: { price: { min: '100', max: '120' }, premium: { min: '-10', max: '0' } },
  };
  const chips = activeFilterChips(filters, 'bond');
  assert.equal(chips.length, 4);
  assert(chips.some((c) => c.label === '-10≤转股溢价率≤0%'));
  const changed = clearFilter(filters, 'range:premium');
  assert.equal(changed.ranges.premium, undefined);
  assert.equal(changed.ranges.price.max, '120');
  assert(changed.watchOnly);
  assert.equal(filters.ranges.premium.min, '-10');
});
test('条件与多套方案可序列化独立恢复，同名更新且限制10套', () => {
  const preferences = emptyFilterPreferences();
  preferences.bond.applied = {
    ...emptyMarketFilters(),
    ranges: { price: { min: '', max: '120' } },
  };
  preferences.bond = upsertFilterPreset(preferences.bond, '低价', preferences.bond.applied, 'bond');
  const id = preferences.bond.presets[0].id;
  preferences.bond = upsertFilterPreset(
    preferences.bond,
    '低价',
    { ...emptyMarketFilters(), watchOnly: true },
    'bond',
  );
  assert.equal(preferences.bond.presets.length, 1);
  assert.equal(preferences.bond.presets[0].id, id);
  assert.equal(preferences.bond.applied.ranges.price.max, '120');
  const decoded = decodeFilterPreferences(JSON.stringify(preferences))!;
  assert.equal(decoded.bond.applied.ranges.price.max, '120');
  assert(decoded.bond.presets[0].filters.watchOnly);
  assert.deepEqual(decoded.reit.applied, emptyMarketFilters());
  for (let i = 1; i < 10; i++)
    preferences.bond = upsertFilterPreset(
      preferences.bond,
      `方案${i}`,
      emptyMarketFilters(),
      'bond',
    );
  assert.throws(
    () => upsertFilterPreset(preferences.bond, '第11套', emptyMarketFilters(), 'bond'),
    /最多保存10套/,
  );
});
test('损坏或未知条件不能静默放宽筛选范围', () => {
  assert.equal(decodeFilterPreferences('{broken'), null);
  const preferences = emptyFilterPreferences();
  preferences.bond.applied.ranges.price = { min: '200', max: '100' };
  assert.equal(decodeFilterPreferences(JSON.stringify(preferences)), null);
  preferences.bond.applied = emptyMarketFilters();
  preferences.bond.applied.ranges.unsupported = { min: '1', max: '2' };
  assert.equal(decodeFilterPreferences(JSON.stringify(preferences)), null);
});
