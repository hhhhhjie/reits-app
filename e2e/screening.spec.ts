import { test, expect, type Page } from '@playwright/test';
import { demoQuote } from '../shared/demo';
import { parseBondTerms } from '../shared/fundamentals';
import type { Quote, UniverseItem } from '../shared/types';

async function fixtures(page: Page) {
  const items: UniverseItem[] = Array.from({ length: 4 }, (_, i) => ({
    symbol: `sh${113710 + i}`,
    code: String(113710 + i),
    name: `筛选${i}转债`,
    market: 'SH',
    type: 'bond',
    underlying: 'sh601166',
    bond: {
      ...parseBondTerms({
        TRANSFER_PRICE: 10,
        RATING: ['AAA', 'AA', 'AA+', null][i],
        ACTUAL_ISSUE_SCALE: 20,
        VALUE_DATE: '2023-01-01',
        EXPIRE_DATE: '2029-01-01',
      }),
      stockName: i === 2 ? '*ST测试' : '兴业银行',
      redeemNoticeDate: i === 1 ? '2026-10-01' : null,
    },
  }));
  const quotes: Quote[] = items.map((item, i) => ({
    ...demoQuote('sh113052')!,
    ...item,
    price: [100, 115, 130, 104][i],
    changePercent: 1,
    source: 'tencent',
    timestamp: '2026-10-19T15:00:00+08:00',
  }));
  quotes.push({ ...demoQuote('sh601166')!, price: 12, source: 'tencent' });
  const response = (kind: string, items: UniverseItem[], quotes: Quote[]) => ({
    kind,
    items,
    quotes,
    complete: true,
    total: items.length,
    sourceCount: items.length,
    mode: 'live',
    source: '筛选验证夹具',
    directoryUpdatedAt: '2026-10-19T15:00:00+08:00',
    message: '',
  });
  await page.route('**/api/universe/bond', (route) =>
    route.fulfill({ json: response('bond', items, quotes) }),
  );
  const names = ['折价高分派REIT', '溢价低分派REIT', '分派缺失REIT'];
  const reits: UniverseItem[] = names.map((name, i) => ({
    symbol: `sh${508881 + i}`,
    code: String(508881 + i),
    name,
    market: 'SH',
    type: 'reit',
    reit: {
      nav: 3,
      navDate: '2026-06-30',
      cumulativeNav: 3.8,
      source: 'tencent-fund',
      cashDistributionTtm: null,
      lastDistribution: null,
      lastDistributionDate: null,
      distributionCount: 0,
      coverageStart: '2021-01-01',
      asOfDate: '2026-10-19',
    },
  }));
  const reitQuotes: Quote[] = reits.map((item, i) => ({
    ...demoQuote('sh508056')!,
    ...item,
    price: [2.7, 3.3, 2.8][i],
    source: 'tencent',
    timestamp: '2026-10-19T15:00:00+08:00',
  }));
  await page.route('**/api/universe/reit', (route) =>
    route.fulfill({ json: response('reit', reits, reitQuotes) }),
  );
  await page.route('**/api/reit/*', (route) => {
    const index = reits.findIndex((item) => route.request().url().endsWith(item.symbol));
    return route.fulfill({
      json: {
        symbol: reits[index]?.symbol,
        available: true,
        metrics:
          index < 0
            ? null
            : {
                ...reits[index].reit,
                cashDistributionTtm: [0.27, 0.1, null][index],
                source: 'mixed',
              },
        fetchedAt: '2026-10-19T15:00:00+08:00',
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('沪深全市场 · 4只', { exact: true })).toBeVisible();
}
test('组合筛选、方案保存、重启恢复及不同品种隔离', async ({ page }) => {
  await fixtures(page);
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('textbox', { name: '现价最低值', exact: true }).fill('100');
  await panel.getByRole('textbox', { name: '现价最高值', exact: true }).fill('120');
  await panel.getByRole('textbox', { name: '转股溢价率最低值', exact: true }).fill('-20');
  await panel.getByRole('textbox', { name: '转股溢价率最高值', exact: true }).fill('0');
  await panel.getByRole('checkbox', { name: 'AAA', exact: true }).click();
  await panel.getByRole('checkbox', { name: 'AA', exact: true }).click();
  await panel.getByRole('button', { name: '排除已公告赎回', exact: true }).click();
  await expect(panel.getByRole('button', { name: '应用筛选（1只）', exact: true })).toBeVisible();
  await panel.getByRole('textbox', { name: '筛选方案名称', exact: true }).fill('低价组合');
  await panel.getByRole('button', { name: '保存方案', exact: true }).click();
  await expect(panel.getByText('已保存本机方案「低价组合」', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '应用筛选（1只）', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选0转债', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看筛选1转债', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '取消现价筛选', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看筛选1转债', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看溢价低分派REIT', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消现价筛选', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '可转债', exact: true }).click();
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '载入筛选方案低价组合', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: '重置筛选', exact: true }).click();
  await panel.getByRole('button', { name: '应用筛选（4只）', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选1转债', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  await panel.getByRole('button', { name: '载入筛选方案低价组合', exact: true }).click();
  await panel.getByRole('button', { name: '应用筛选（1只）', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选1转债', exact: true })).toHaveCount(0);
});
test('非法范围不能生效，关闭放弃草稿，单项清除及空结果可恢复', async ({ page }) => {
  await fixtures(page);
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('textbox', { name: '现价最低值', exact: true }).fill('200');
  await panel.getByRole('textbox', { name: '现价最高值', exact: true }).fill('100');
  await panel.getByRole('button', { name: '检查筛选范围', exact: true }).click();
  await expect(panel.getByText('现价：最低值不能大于最高值', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '关闭筛选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选2转债', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '价格≤120', exact: true }).click();
  await page.getByRole('button', { name: '仅自选', exact: true }).click();
  await expect(page.getByText('没有符合条件的数据', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消仅自选筛选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选1转债', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看筛选2转债', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '取消现价筛选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选2转债', exact: true })).toBeVisible();
});
test('REITs折价和历史分派率组合，缺失分派指标排除且可重启恢复', async ({ page }) => {
  await fixtures(page);
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('textbox', { name: '净值溢价率最高值', exact: true }).fill('－５％');
  await panel.getByRole('textbox', { name: '历史现金分派率最低值', exact: true }).fill('5');
  await panel.getByRole('button', { name: '应用筛选（1只）', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看折价高分派REIT', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看分派缺失REIT', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看溢价低分派REIT', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await page.getByRole('tab', { name: 'REITs', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消净值溢价率筛选', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看分派缺失REIT', exact: true })).toHaveCount(0);
});
test('本机写入失败仍可筛选，但不会宣称方案保存成功', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'zx.filters.v1') throw new Error('Storage quota exceeded');
      return setItem.call(this, key, value);
    };
  });
  await fixtures(page);
  await page.getByRole('button', { name: '设置筛选', exact: true }).click();
  const panel = page.getByTestId('filter-panel');
  await panel.getByRole('textbox', { name: '现价最高值', exact: true }).fill('120');
  await panel.getByRole('textbox', { name: '筛选方案名称', exact: true }).fill('保存失败测试');
  await panel.getByRole('button', { name: '保存方案', exact: true }).click();
  await expect(panel.getByText('本次会话可用，但未能保存到本机。', { exact: true })).toBeVisible();
  await expect(panel.getByText('已保存本机方案「保存失败测试」', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: '应用筛选（3只）', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看筛选2转债', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('筛选在本次会话中已生效，但未能保存到本机。', { exact: true }),
  ).toBeVisible();
});
