import { test, expect, type Page } from '@playwright/test';
import { demoQuote } from '../shared/demo';
import { parseBondTerms } from '../shared/fundamentals';
import type { BondModelInputs, Quote, UniverseItem } from '../shared/types';

const inputs: BondModelInputs = {
  symbol: 'sh600100',
  asOf: '2026-10-23',
  available: true,
  volatility: 0,
  volatilityStartDate: '2026-07-27',
  volatilityEndDate: '2026-10-22',
  returnCount: 60,
  treasuryCurve: [
    { years: 2, rate: 0 },
    { years: 5, rate: 0 },
    { years: 10, rate: 0 },
    { years: 30, rate: 0 },
  ],
  treasuryDate: '2026-10-22',
  fetchedAt: '2026-10-23T08:00:00Z',
  message: '零波动、零国债率、零股息的可精确复核场景',
};
async function fixture(page: Page, bad = false) {
  const items: UniverseItem[] = ['模型甲转债', '模型乙转债', '纯债缺失转债', '公告赎回转债'].map(
    (name, i) => ({
      symbol: `sh${113900 + i}`,
      code: String(113900 + i),
      name,
      market: 'SH',
      type: 'bond',
      underlying: 'sh600100',
      bond: {
        ...parseBondTerms({
          TRANSFER_PRICE: 10,
          VALUE_DATE: '2021-10-23',
          EXPIRE_DATE: '2027-10-23',
          REDEEM_CLAUSE: '面值的100%(含最后一期利息)',
        }),
        pureBondValue: [100, 95, null, 100][i],
        pureBondDate: '2026-10-22',
        redeemNoticeDate: i === 3 ? '2026-10-20' : null,
      },
    }),
  );
  const quotes: Quote[] = items.map((i, index) => ({
    ...demoQuote('sh113052')!,
    ...i,
    price: [102, 120, 101, 104][index],
    changePercent: 1,
    source: 'tencent',
    timestamp: '2026-10-23T15:00:00+08:00',
  }));
  quotes.push({
    ...demoQuote('sh601166')!,
    symbol: 'sh600100',
    code: '600100',
    name: '模型正股',
    price: 11,
    dividendYield: 0,
    source: 'tencent',
    timestamp: '2026-10-23T15:00:00+08:00',
  });
  let calls = 0;
  await page.route('**/api/universe/bond', (r) =>
    r.fulfill({
      json: {
        kind: 'bond',
        items,
        quotes,
        complete: true,
        total: 4,
        sourceCount: 4,
        mode: 'live',
        fetchedAt: '2026-10-23T08:00:00Z',
        directoryUpdatedAt: '2026-10-23T08:00:00Z',
        source: '精确模型交互夹具',
        message: '',
      },
    }),
  );
  await page.route('**/api/bond-model?*', (r) => {
    calls++;
    return bad
      ? r.fulfill({ status: 502, json: { error: 'offline' } })
      : r.fulfill({ json: { items: [inputs] } });
  });
  await page.goto('/');
  await expect(page.getByText('沪深全市场 · 4只', { exact: true })).toBeVisible();
  return () => calls;
}

test('四项指标、零期权、缺失保留、全局偏离排序与按需加载', async ({ page }) => {
  const calls = await fixture(page);
  expect(calls()).toBe(0);
  await page.getByRole('tab', { name: '理论估值', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '模型甲转债期权价值10.00', exact: true }),
  ).toBeAttached();
  expect(calls()).toBe(1); // 同一正股只请求一套参数
  await expect(
    page.getByRole('button', { name: '模型甲转债纯债价值100.00', exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: '模型甲转债理论价值110.00', exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: '模型甲转债理论偏离度-7.27%', exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: '纯债缺失转债理论价值缺失', exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: '公告赎回转债期权价值缺失', exact: true }),
  ).toBeAttached();
  await page.getByRole('button', { name: '按理论偏离度排序', exact: true }).click();
  const names = page.getByRole('button', { name: /^查看.*转债$/ });
  await expect(names.first()).toHaveAccessibleName('查看模型乙转债');
  await page.getByRole('button', { name: '按理论偏离度排序', exact: true }).click();
  await expect(names.first()).toHaveAccessibleName('查看模型甲转债');
});

test('负理论偏离组合筛选、预览补全和本机方案恢复', async ({ page }) => {
  const calls = await fixture(page);
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  const panel = page.getByTestId('filter-panel');
  expect(calls()).toBe(0);
  await panel.getByRole('textbox', { name: '理论偏离度最低值', exact: true }).fill('-10');
  await panel.getByRole('textbox', { name: '理论偏离度最高值', exact: true }).fill('0');
  await panel.getByRole('textbox', { name: '纯债价值最低值', exact: true }).fill('100');
  await expect(panel.getByRole('button', { name: '应用筛选（1只）', exact: true })).toBeVisible();
  expect(calls()).toBe(1);
  await panel.getByRole('textbox', { name: '筛选方案名称', exact: true }).fill('模型偏离组合');
  await panel.getByRole('button', { name: '保存方案', exact: true }).click();
  await expect(panel.getByText('已保存本机方案「模型偏离组合」', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '应用筛选（1只）', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: '查看模型甲转债', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看模型乙转债', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '取消理论偏离度筛选', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看模型甲转债', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看纯债缺失转债', exact: true })).toHaveCount(0);
});

test('详情展示模型口径和原始日期，本机转股价修正实时改变估算且可清除', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: '查看模型甲转债', exact: true }).click();
  const detail = page.getByTestId('security-detail');
  const option = detail.getByText('期权价值', { exact: true }).locator('..');
  await expect(option.getByText('10.00', { exact: true })).toBeVisible();
  await expect(detail.getByText('理论估值口径与参数', { exact: true })).toBeVisible();
  await expect(detail.getByText(/波动率区间：2026-07-27～2026-10-22/)).toBeVisible();
  await expect(detail.getByText(/不等同集思录模型/)).toBeVisible();
  await detail.getByRole('textbox', { name: '当前有效转股价', exact: true }).fill('11');
  await detail.getByRole('button', { name: '保存参数', exact: true }).click();
  await expect(option.getByText('0.00', { exact: true })).toBeVisible();
  await detail.getByRole('textbox', { name: '当前有效转股价', exact: true }).fill('');
  await detail.getByRole('button', { name: '保存参数', exact: true }).click();
  await expect(option.getByText('10.00', { exact: true })).toBeVisible();
});

test('估值参数不可达时纯债值保留、模型不填零，恢复后可重试', async ({ page }) => {
  await fixture(page, true);
  await page.getByRole('tab', { name: '理论估值', exact: true }).click();
  await expect(page.getByText(/参数已检查 1\/1只正股，0只历史与利率可用/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '模型甲转债纯债价值100.00', exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: '模型甲转债期权价值缺失', exact: true }),
  ).toBeAttached();
  await page.route('**/api/bond-model?*', (r) => r.fulfill({ json: { items: [inputs] } }));
  await page.getByRole('button', { name: '重新加载估值参数', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '模型甲转债理论价值110.00', exact: true }),
  ).toBeAttached();
});
