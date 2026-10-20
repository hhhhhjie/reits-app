import { test, expect, type Page } from '@playwright/test';
import { demoQuote } from '../shared/demo';
import { HK_REITS } from '../shared/catalog';
import type { IncomeResponse, IncomeScope, Instrument, Quote } from '../shared/types';

async function fixtures(page: Page) {
  const a: Instrument[] = Array.from({ length: 30 }, (_, i) => ({
    symbol: `sh${600100 + i}`,
    code: String(600100 + i),
    name: `股息公司${String(i).padStart(2, '0')}`,
    market: 'SH',
    type: 'stock',
  }));
  const hk: Instrument[] = [
    { symbol: 'hk00700', code: '00700', name: '腾讯控股', market: 'HK', type: 'stock' },
    { symbol: 'hk00941', code: '00941', name: '中国移动', market: 'HK', type: 'stock' },
  ];
  function response(scope: IncomeScope): IncomeResponse {
    const items = scope === 'a' ? a : scope === 'hk' ? hk : HK_REITS;
    const quotes: Quote[] = items.map((i, n) => ({
      ...demoQuote('sh600519')!,
      ...i,
      price: scope === 'a' ? 10 + n / 10 : 5 + n,
      previousClose: 10,
      changePercent: 1.2,
      pe: n === 12 ? -5 : 12,
      pb: 0.8 + n / 20,
      dividendYield: scope === 'a' ? (n === 28 ? null : n / 2) : 6 + n,
      dividendPerShare: scope === 'a' ? null : 0.5,
      currency: i.market === 'HK' && i.symbol !== 'hk87001' ? 'HKD' : 'CNY',
      source: 'tencent',
      timestamp: '2026-10-19T15:00:00+08:00',
      securityClass: scope === 'hkreit' ? 'GP-FUND-REITS' : scope === 'a' ? 'GP-A' : 'GP',
    }));
    return {
      scope,
      items,
      quotes,
      mode: 'live',
      directoryComplete: scope !== 'hkreit',
      sourceCount: items.length,
      directoryDate: '2026-10-19',
      fetchedAt: '2026-10-19T15:01:00+08:00',
      source: '交互测试夹具',
      message:
        scope === 'hkreit'
          ? '港股REITs为维护名单，未宣称动态全市场。'
          : '已读完源目录；五年均值及估值温度未取得。',
    };
  }
  await page.route('**/api/income/*', (route) =>
    route.fulfill({ json: response(route.request().url().split('/').pop() as IncomeScope) }),
  );
  await page.goto('/');
  await page.getByRole('tab', { name: '股息率', exact: true }).click();
  await expect(page.getByText('30 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
}

test('股息页全局排序、跨页搜索、缺失数据及五年均值不虚构', async ({ page }) => {
  await fixtures(page);
  const names = page.getByTestId('income-table').getByRole('button', { name: /^查看/ });
  await expect(names).toHaveCount(25);
  await expect(names.first()).toHaveAccessibleName('查看股息公司29');
  await page.getByRole('button', { name: '股息表按价格排序', exact: true }).click();
  await page.getByRole('button', { name: '股息表按价格排序', exact: true }).click();
  await expect(names.first()).toHaveAccessibleName('查看股息公司00');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(names).toHaveCount(5);
  await expect(page.getByRole('button', { name: '查看股息公司28', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索股息证券', exact: true }).fill('股息公司00');
  await expect(names).toHaveCount(1);
  await expect(names.first()).toHaveAccessibleName('查看股息公司00');
  await expect(
    page.getByRole('button', { name: '股息公司00五年平均股息率', exact: true }),
  ).toHaveText('—');
  await page.getByRole('button', { name: '股息指标口径', exact: true }).click();
  await expect(page.getByText(/不套用集思录私有模型/)).toBeVisible();
});

test('股息区间校验、取消草稿、组合应用和A港股独立恢复', async ({ page }) => {
  await fixtures(page);
  await page.getByRole('button', { name: '设置股息筛选', exact: true }).click();
  const panel = page.getByTestId('income-filter-panel');
  for (const input of await panel.getByRole('textbox').all()) {
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await panel.getByRole('textbox', { name: '股息筛选股息率最低值', exact: true }).fill('9');
  await panel.getByRole('textbox', { name: '股息筛选股息率最高值', exact: true }).fill('5');
  await panel.getByRole('button', { name: '应用股息筛选（—只）', exact: true }).click();
  await expect(panel.getByText('股息率：最低值不能大于最高值', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '关闭股息筛选', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '设置股息筛选', exact: true }).click();
  await expect(
    panel.getByRole('textbox', { name: '股息筛选股息率最低值', exact: true }),
  ).toHaveValue('');
  await panel.getByRole('textbox', { name: '股息筛选股息率最低值', exact: true }).fill('５％');
  await panel.getByRole('textbox', { name: '股息筛选股息率最高值', exact: true }).fill('8');
  await panel.getByRole('checkbox', { name: '只看PE为正', exact: true }).click();
  await panel.getByRole('button', { name: '应用股息筛选（6只）', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText('6 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '股息率', exact: true }).click();
  await expect(page.getByText('6 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '港股', exact: true }).click();
  await expect(page.getByText('2 / 2只 · 股息率已取得 2只', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'A股', exact: true }).click();
  await expect(page.getByText('6 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清空股息筛选', exact: true }).click();
  await expect(page.getByText('30 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
});

test('港股REITs、人民币柜台、详情和自选保持正确类型与币种', async ({ page }) => {
  await fixtures(page);
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await page.getByRole('tab', { name: '港股REITs', exact: true }).click();
  await expect(page.getByText('10 / 10只 · 股息率已取得 10只', { exact: true })).toBeVisible();
  await expect(page.getByText('87001 · CNY', { exact: true })).toBeVisible();
  await expect(page.getByText('00823 · HKD', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '自选领展房产基金', exact: true }).click();
  await expect(page.getByRole('button', { name: '移除领展房产基金', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看领展房产基金', exact: true }).click();
  await expect(page.getByText('最新价 · 港元 HKD', { exact: true })).toBeVisible();
  await expect(page.getByText(/当前未接入已核验的港股REITs披露净值/)).toBeVisible();
  await expect(page.getByText('净值与历史现金分派', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索股息证券', exact: true }).fill('87001');
  await page.getByRole('button', { name: '查看汇贤产业信托', exact: true }).click();
  await expect(page.getByText('最新价 · 人民币 CNY', { exact: true })).toBeVisible();
});

test('行情刷新失败保留时间，本机写入失败仍可使用会话条件', async ({ page }) => {
  await fixtures(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '股息≥8%', exact: true }).click();
  await expect(page.getByText('13 / 30只 · 股息率已取得 29只', { exact: true })).toBeVisible();
  await expect(
    page.getByText('筛选已在本次会话生效，但未能保存到本机。', { exact: true }),
  ).toBeVisible();
  const before = await page
    .getByRole('button', { name: '股息公司29报价时间', exact: true })
    .textContent();
  await page.route('**/api/income/a', (route) =>
    route.fulfill({ status: 502, json: { error: 'offline' } }),
  );
  await page.getByRole('button', { name: '刷新股息行情', exact: true }).click();
  await expect(page.getByText('缓存行情', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '股息公司29报价时间', exact: true })).toHaveText(
    before!,
  );
});
