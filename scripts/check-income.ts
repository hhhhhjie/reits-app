import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { directSource, fetchNativeText } from '../src/direct-source';
import type { IncomeScope } from '../shared/types';

setGlobalDispatcher(new EnvHttpProxyAgent());
async function main() {
  for (const scope of ['a', 'hk', 'hkreit'] as IncomeScope[]) {
    const start = Date.now();
    const data = await directSource.getIncome(scope);
    assert.equal(data.mode, 'live', data.message);
    assert(data.items.length >= (scope === 'a' ? 4000 : scope === 'hk' ? 1000 : 10));
    assert.equal(new Set(data.items.map((i) => i.symbol)).size, data.items.length);
    assert.equal(data.directoryComplete, scope !== 'hkreit');
    assert(data.quotes.length > data.items.length * 0.8, '大部分证券必须有真实报价');
    assert(data.quotes.every((q) => q.source === 'tencent' && q.timestamp && q.price > 0));
    const yields = data.quotes.filter((q) => q.dividendYield != null);
    console.log(
      JSON.stringify({
        checking: scope,
        items: data.items.length,
        quotes: data.quotes.length,
        yields: yields.length,
        missingExamples: data.quotes
          .filter((q) => q.dividendYield == null)
          .slice(0, 8)
          .map((q) => q.symbol),
      }),
    );
    if (process.env.INCOME_REPORT_DIR)
      writeFileSync(`${process.env.INCOME_REPORT_DIR}/income-${scope}.json`, JSON.stringify(data));
    assert(yields.length > data.quotes.length * 0.8, '不能用缺失或推测的股息率通过验证');
    if (scope === 'hkreit') {
      assert.equal(data.quotes.find((q) => q.symbol === 'hk87001')?.currency, 'CNY');
      assert.equal(data.quotes.find((q) => q.symbol === 'hk00823')?.currency, 'HKD');
    }
    if (process.env.INCOME_REPORT_DIR)
      writeFileSync(`${process.env.INCOME_REPORT_DIR}/income-${scope}.json`, JSON.stringify(data));
    console.log(
      JSON.stringify({
        scope,
        directory: data.items.length,
        quotes: data.quotes.length,
        yields: yields.length,
        pe: data.quotes.filter((q) => q.pe != null).length,
        pb: data.quotes.filter((q) => q.pb != null).length,
        seconds: ((Date.now() - start) / 1000).toFixed(1),
        source: data.source,
      }),
    );
  }
  // 独立现金分红记录核对扩展协议字段的量级和百分数单位，允许源刷新时点差异。
  const q = (await directSource.getQuotes(['sh600519'])).quotes[0];
  const raw = JSON.parse(
    await fetchNativeText(
      'https://datacenter-web.eastmoney.com/api/data/v1/get?' +
        new URLSearchParams({
          reportName: 'RPT_SHAREBONUS_DET',
          columns: 'ALL',
          filter: '(SECURITY_CODE="600519")',
          pageNumber: '1',
          pageSize: '100',
        }),
      'utf-8',
    ),
  );
  assert(raw.success && raw.result.data.length === raw.result.count);
  const day = q.timestamp!.slice(0, 10),
    cutoff = new Date(`${day}T00:00:00+08:00`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const start = new Date(cutoff.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const rows = raw.result.data.filter(
    (r: Record<string, unknown>) =>
      r.ASSIGN_PROGRESS === '实施分配' &&
      String(r.EX_DIVIDEND_DATE).slice(0, 10) > start &&
      String(r.EX_DIVIDEND_DATE).slice(0, 10) <= day,
  );
  assert(rows.length > 0);
  const cash = rows.reduce(
    (sum: number, r: Record<string, unknown>) => sum + Number(r.PRETAX_BONUS_RMB) / 10,
    0,
  );
  const independentlyCalculated = (cash / q.price) * 100;
  assert(q.dividendYield != null && Math.abs(q.dividendYield - independentlyCalculated) < 0.15);
  console.log(
    JSON.stringify({
      symbol: q.symbol,
      sourceYield: q.dividendYield,
      cashPerShare: cash,
      independentlyCalculated,
      quoteTime: q.timestamp,
    }),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
