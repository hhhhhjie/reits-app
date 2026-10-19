import assert from 'node:assert/strict';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { directSource } from '../src/direct-source';
import { marketMetric } from '../shared/market-metrics';
import { mapConcurrent } from '../shared/universe';
import { writeFileSync } from 'node:fs';

setGlobalDispatcher(new EnvHttpProxyAgent());
async function main() {
  const results = await Promise.all(
    (['bond', 'reit'] as const).map((kind) => directSource.getUniverse(kind)),
  );
  for (const data of results) {
    if (process.env.UNIVERSE_REPORT_DIR)
      writeFileSync(
        `${process.env.UNIVERSE_REPORT_DIR}/${data.kind}-universe.json`,
        JSON.stringify(data),
      );
    assert.equal(data.mode, 'live');
    assert.equal(data.complete, true);
    assert.equal(data.total, data.items.length);
    assert(new Set(data.items.map((i) => i.symbol)).size === data.items.length);
    const quotes = Object.fromEntries(data.quotes.map((q) => [q.symbol, q]));
    const withQuotes = data.items.filter((i) => quotes[i.symbol]);
    assert(data.items.length > (data.kind === 'bond' ? 150 : 20), '不得用精选目录替代全市场验证');
    assert(withQuotes.length >= data.items.length * 0.8, '大部分品种必须取得真实报价');
    assert(data.quotes.every((q) => q.source === 'tencent' && q.timestamp && q.price > 0));
    const report: Record<string, unknown> = {
      kind: data.kind,
      total: data.total,
      sourceCount: data.sourceCount,
      quotes: withQuotes.length,
      source: data.source,
    };
    if (data.kind === 'bond') {
      for (const key of [
        'conversionPrice',
        'premium',
        'doubleLow',
        'ytm',
        'rating',
        'redemptionPrice',
        'redeemTriggerPrice',
      ])
        report[key] = data.items.filter((i) => marketMetric(i, key, quotes) != null).length;
      assert(Number(report.premium) > data.items.length * 0.8);
      assert(Number(report.ytm) > 0);
    } else {
      report.disclosedNAV = data.items.filter((i) => i.reit?.nav && i.reit.navDate).length;
      assert(
        Number(report.disclosedNAV) > data.items.length * 0.8,
        '必须取得独立披露净值，不能由交易价格推算',
      );
      const first = data.items.find((i) => i.reit)!;
      report.navExample = { symbol: first.symbol, ...first.reit };
      const metrics = await directSource.getReitMetrics(first.symbol);
      assert(metrics.available && metrics.metrics?.navDate);
      report.cashDividendHistoryAvailable = metrics.metrics?.cashDistributionTtm != null;
      report.dividendMessage = metrics.message;
      if (process.argv.includes('--all-funds')) {
        const funds = await mapConcurrent(data.items, 4, async (item) =>
          directSource.getReitMetrics(item.symbol),
        );
        report.fundMetricsChecked = funds.length;
        report.fundMetricsWithNAV = funds.filter((f) => f.available).length;
        report.cashDistributionTtm = funds.filter(
          (f) => f.metrics?.cashDistributionTtm != null,
        ).length;
        report.fundMetricsMissing = funds
          .filter((f) => !f.available || f.metrics?.cashDistributionTtm == null)
          .map((f) => f.symbol);
        if (process.env.UNIVERSE_REPORT_DIR)
          writeFileSync(
            `${process.env.UNIVERSE_REPORT_DIR}/reit-fundamentals.json`,
            JSON.stringify(funds),
          );
      }
    }
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
