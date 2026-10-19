import { test, expect } from '@playwright/test';
import { demoQuote } from '../shared/demo';
import { parseBondTerms } from '../shared/fundamentals';

test('品种标签、筛选、排序与A/H币种说明', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByText('演示模式 · 行情源暂不可达，价格为固定样本，不代表当前市场。'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '查看兴业转债', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '价格≤120', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看兴业转债', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看南银转债', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '按现价排序', exact: true }).click();
  await expect(page.getByRole('button', { name: /^查看.*转债$/ }).first()).toHaveAccessibleName(
    '查看南银转债',
  );
  await page.getByRole('button', { name: '按现价排序', exact: true }).click();
  await expect(page.getByRole('button', { name: /^查看.*转债$/ }).first()).toHaveAccessibleName(
    '查看通22转债',
  );
  await page.getByRole('tab', { name: 'ETF', exact: true }).click();
  await expect(page.getByText('ETF行情', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await expect(page.getByText('REITs行情', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'A/H比价', exact: true }).click();
  await expect(page.getByText('A/H 两地价格', { exact: true })).toBeVisible();
  await expect(page.getByText(/原币价比未作汇率换算/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('搜索、自选及重载后持久保存', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索证券', exact: true }).fill('txkg');
  await expect(page.getByRole('button', { name: '搜索结果腾讯控股', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '移除腾讯控股自选', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加腾讯控股自选', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await page.getByRole('tab', { name: '自选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看腾讯控股', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('tab', { name: '自选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看贵州茅台', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看腾讯控股', exact: true })).toHaveCount(0);
});

test('转债参数计算、历史图表与清除参数', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看兴业转债', exact: true }).click();
  await expect(
    page.getByText('报价时间：2025/03/14 15:00（北京时间）', { exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '当前有效转股价', exact: true }).fill('20.72');
  await page.getByRole('button', { name: '保存参数', exact: true }).click();
  await expect(page.getByText('已保存本机参数，请与最新公告核对', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('+16.82%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '切换K线', exact: true }).click();
  await expect(page.getByRole('button', { name: '切换折线', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '60日走势', exact: true }).click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '双低≤130', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看兴业转债', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '查看兴业转债', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '当前有效转股价', exact: true })).toHaveValue(
    '20.72',
  );
  await page.getByRole('textbox', { name: '当前有效转股价', exact: true }).fill('');
  await page.getByRole('button', { name: '保存参数', exact: true }).click();
  await expect(page.getByText('已清除转股价参数', { exact: true })).toBeVisible();
});

test('行情市场过滤和服务地址校验', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '行情', exact: true }).click();
  await page.getByRole('tab', { name: '港股行情', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看腾讯控股', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看贵州茅台', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '我的', exact: true }).click();
  await page
    .getByRole('textbox', { name: '行情服务地址', exact: true })
    .fill('javascript:alert(1)');
  await page.getByRole('button', { name: '保存地址', exact: true }).click();
  await expect(page.getByText(/请输入有效的 http/)).toBeVisible();
  await page.getByRole('button', { name: '检测连接', exact: true }).click();
  await expect(page.getByText(/行情服务连接成功/)).toBeVisible();
});

test('行情后端断开时明确进入离线演示', async ({ page }) => {
  await page.route('**/api/quotes?**', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByText(/无法连接行情服务，请检查网络或服务地址/)).toBeVisible();
  await expect(page.getByRole('button', { name: '查看兴业转债', exact: true })).toBeVisible();
  await expect(
    page.getByText('演示模式 · 行情源暂不可达，价格为固定样本，不代表当前市场。'),
  ).toBeVisible();
});

test('新股源不可用时保留官方入口，不展示虚拟申购记录', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: '新股', exact: true }).click();
  await expect(page.getByText('A股新股申购日历', { exact: true })).toBeVisible();
  await expect(page.getByText('发行日历暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '上海证券交易所', exact: true })).toBeVisible();
});

test('完整转债名单跨页搜索和全局排序，缺报价仍保留，自动参数进入详情', async ({ page }) => {
  const items = Array.from({ length: 62 }, (_, i) => ({
    symbol: `sh${113700 + i}`,
    code: String(113700 + i),
    name: `全量${i}转债`,
    market: 'SH',
    type: 'bond',
    underlying: 'sh600519',
    bond: {
      ...parseBondTerms({
        TRANSFER_PRICE: 10,
        RATING: 'AA+',
        VALUE_DATE: '2023-01-01',
        EXPIRE_DATE: '2029-01-01',
      }),
      stockName: '贵州茅台',
    },
  }));
  const quotes = items
    .filter((_, i) => i !== 30)
    .map((item) => ({
      ...demoQuote('sh113052')!,
      ...item,
      price: 100 + Number(item.code) - 113700,
      changePercent: 0,
      source: 'tencent',
      timestamp: '2026-10-19T15:00:00+08:00',
    }));
  quotes.push({
    ...demoQuote('sh600519')!,
    price: 12,
    source: 'tencent',
  } as (typeof quotes)[number]);
  await page.route('**/api/universe/bond', (route) =>
    route.fulfill({
      json: {
        kind: 'bond',
        items,
        quotes,
        complete: true,
        total: 62,
        sourceCount: 62,
        mode: 'live',
        source: '完整目录测试夹具',
        directoryUpdatedAt: '2026-10-19T15:00:00+08:00',
        fetchedAt: '2026-10-19T15:00:00+08:00',
        message: '1只行情暂缺，仍保留在名单中。',
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('沪深全市场 · 62只', { exact: true })).toBeVisible();
  await expect(page.getByText('1 / 3 页 · 共62只', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText('2 / 3 页 · 共62只', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看全量30转债', exact: true })).toBeVisible();
  await expect(page.getByText('SH 113730 · 行情暂缺', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索全市场可转债', exact: true }).fill('113761');
  await expect(page.getByRole('button', { name: '查看全量61转债', exact: true })).toBeVisible();
  await expect(page.getByText('1 / 1 页 · 共1只', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索全市场可转债', exact: true }).fill('');
  await page.getByRole('button', { name: '按现价排序', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^查看全量\d+转债$/ }).first(),
  ).toHaveAccessibleName('查看全量61转债');
  await page.getByRole('button', { name: '查看全量61转债', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('10.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('AA+', { exact: true })).toBeVisible();
});

test('REITs披露净值日期、折溢价和现金分红口径保持独立', async ({ page }) => {
  const metrics = {
    nav: 3,
    navDate: '2026-06-30',
    cumulativeNav: 3.8,
    source: 'tencent-fund',
    cashDistributionTtm: null,
    lastDistribution: null,
    lastDistributionDate: null,
    distributionCount: 0,
    coverageStart: '2026-06-30',
    asOfDate: '2026-10-19',
  };
  const item = {
    symbol: 'sh508888',
    code: '508888',
    name: '全量验证REIT',
    market: 'SH',
    type: 'reit',
    reit: metrics,
  };
  await page.route('**/api/universe/reit', (route) =>
    route.fulfill({
      json: {
        kind: 'reit',
        items: [item],
        quotes: [
          {
            ...demoQuote('sh508056')!,
            ...item,
            price: 3.3,
            source: 'tencent',
            timestamp: '2026-10-19T15:00:00+08:00',
          },
        ],
        complete: true,
        total: 1,
        sourceCount: 1,
        mode: 'live',
        source: 'REIT完整目录测试夹具',
        directoryUpdatedAt: '2026-10-19T15:00:00+08:00',
        message: '',
      },
    }),
  );
  await page.route('**/api/reit/sh508888', (route) =>
    route.fulfill({
      json: {
        symbol: item.symbol,
        available: true,
        metrics: {
          ...metrics,
          source: 'eastmoney-fund',
          cashDistributionTtm: 0.3,
          lastDistribution: 0.1,
          lastDistributionDate: '2026-09-01',
          distributionCount: 3,
        },
        fetchedAt: '2026-10-19T15:00:00+08:00',
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await page.getByRole('tab', { name: '净值与分派', exact: true }).click();
  await expect(page.getByText('2026-06-30', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '全量验证REIT净值溢价率+10.00%', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('2026-09-01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '指标口径', exact: true }).click();
  await expect(page.getByText(/不能当作未来或年化预测/)).toBeVisible();
});
