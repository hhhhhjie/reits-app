import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHistory,
  parseIPOs,
  parseQuotes,
  parseSearch,
  parseTimestamp,
} from '../shared/parsers';
import { searchCatalog, validSymbol } from '../shared/catalog';
import { bondValuation } from '../shared/valuation';
import { demoHistory, demoQuote } from '../shared/demo';

function fixture(symbol = 'sh600519', hk = false) {
  const fields = Array(65).fill('');
  Object.assign(fields, {
    0: hk ? '100' : '1',
    1: hk ? '腾讯控股' : '贵州茅台',
    2: symbol.slice(2),
    3: '110',
    4: '100',
    5: '102',
    6: '12345',
    30: hk ? '2026/10/19 16:08:00' : '20261019150000',
    31: hk ? '9999' : '10',
    32: hk ? '10' : '10',
    33: '112',
    34: '99',
    37: '1800',
    38: '2.4',
    39: '25.6',
    45: '1200',
  });
  return `v_${symbol}="${fields.join('~')}";`;
}
test('A股价格、涨跌和成交额单位正确', () => {
  const [q] = parseQuotes(fixture());
  assert.equal(q.name, '贵州茅台');
  assert.equal(q.price, 110);
  assert.equal(q.change, 10);
  assert.equal(q.changePercent, 10);
  assert.equal(q.turnover, 18000000);
  assert.equal(q.marketCap, 120000000000);
  assert.equal(q.currency, 'CNY');
  assert.equal(q.timestamp, '2026-10-19T15:00:00+08:00');
});
test('港股涨跌由价格计算，不读取不同口径的31/32字段', () => {
  const [q] = parseQuotes(fixture('hk00700', true));
  assert.equal(q.change, 10);
  assert.equal(q.changePercent, 10);
  assert.equal(q.currency, 'HKD');
  assert.equal(q.turnover, null);
  assert.equal(q.timestamp, '2026-10-19T16:08:00+08:00');
});
test('忽略停用、空值、非法代码及截断响应', () => {
  assert.deepEqual(parseQuotes('v_sh600519="1~";v_foo="1~foo~123~5";'), []);
  assert.equal(parseQuotes(fixture().replace('~110~100~', '~0~100~')).length, 0);
  assert.equal(parseQuotes(fixture() + fixture('hk00700', true)).length, 2);
});
test('不把缺失数值解析为零', () => {
  const [q] = parseQuotes(fixture().replace('~1800~2.4~25.6~', '~~--~-~'));
  assert.equal(q.turnover, null);
  assert.equal(q.turnoverRate, null);
  assert.equal(q.pe, null);
});
test('报价时间带中国时区，未知格式不猜测', () => {
  assert.equal(parseTimestamp('20261019093001'), '2026-10-19T09:30:01+08:00');
  assert.equal(parseTimestamp('garbage'), null);
  assert.equal(parseTimestamp(), null);
});
test('历史数据使用前复权并过滤不完整记录', () => {
  const data = {
    data: {
      sh600519: {
        qfqday: [
          ['2026-10-16', '100', '110', '112', '99', '1234'],
          ['bad', '1', '2', '3', '4', '5'],
          ['2026-10-19', null, '1', '2', '3', '4'],
        ],
      },
    },
  };
  assert.deepEqual(parseHistory(data, 'sh600519'), [
    { date: '2026-10-16', open: 100, close: 110, high: 112, low: 99, volume: 1234 },
  ]);
  assert.deepEqual(parseHistory({}, 'hk00700'), []);
});
test('搜索不执行远端脚本，并验证证券代码', () => {
  const results = parseSearch(
    'v_hint="sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt^hk~00700~腾讯控股~txkg^evil~123~bad~";process.exit()',
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].name, '贵州茅台');
  assert.equal(results[1].symbol, 'hk00700');
  assert.deepEqual(parseSearch('<html>blocked</html>'), []);
});
test('名称、代码与拼音均可检索；代码拒绝路径与脚本', () => {
  for (const query of ['腾讯', '00700', 'txkg', 'tencent'])
    assert(searchCatalog(query).some((q) => q.symbol === 'hk00700'));
  for (const symbol of ['sh600519', 'sz000001', 'hk00700', 'hkHSI']) assert(validSymbol(symbol));
  for (const symbol of [
    '../.env',
    'https://evil',
    'sh600519;alert(1)',
    'hk700',
    'sh600519,sz000001',
  ])
    assert(!validSymbol(symbol));
});
test('转股溢价、转股价值和双低计算正确', () => {
  const bond = { ...demoQuote('sh113052')!, price: 120 };
  const stock = { ...demoQuote('sh601166')!, price: 20 };
  const result = bondValuation(bond, stock, 20)!;
  assert.equal(result.conversionValue, 100);
  assert(Math.abs(result.premium - 20) < 0.00001);
  assert(Math.abs(result.doubleLow - 140) < 0.00001);
});
test('缺失参数及不同数据源时禁止计算估值', () => {
  const bond = demoQuote('sh113052')!,
    stock = demoQuote('sh601166')!;
  assert.equal(bondValuation(bond, stock, 0), null);
  assert.equal(bondValuation(bond, stock, NaN), null);
  assert.equal(bondValuation(bond, undefined, 20), null);
  assert.equal(bondValuation(bond, { ...stock, source: 'tencent' }, 20), null);
});
test('演示快照使用固定时间，未知代码不伪造报价', () => {
  assert.equal(demoQuote('hk00700')?.source, 'demo');
  assert.equal(demoQuote('hk00700')?.timestamp, '2025-03-14T15:00:00+08:00');
  assert.equal(demoQuote('sh999999'), null);
  assert.equal(demoHistory('hk00700').length, 90);
  assert.equal(demoHistory('hk00700').at(-1)?.close, demoQuote('hk00700')?.price);
});

test('申购日历保留真实日期和缺失发行价，不填充虚拟记录', () => {
  const items = parseIPOs({
    result: {
      data: [
        {
          SECURITY_CODE: '600001',
          SECURITY_NAME: '测试发行字段',
          APPLY_CODE: '730001',
          APPLY_DATE: '2026-10-20 00:00:00',
          ISSUE_PRICE: null,
          LISTING_DATE: null,
        },
        { SECURITY_CODE: 'invalid' },
      ],
    },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].applyDate, '2026-10-20');
  assert.equal(items[0].applyCode, '730001');
  assert.equal(items[0].issuePrice, null);
  assert.equal(items[0].listingDate, null);
  assert.deepEqual(parseIPOs({ success: false }), []);
});
