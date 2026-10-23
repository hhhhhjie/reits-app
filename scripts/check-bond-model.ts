import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { directSource } from '../src/direct-source';
import { bondModelValuation, modelKey } from '../shared/bond-model';
import { mapConcurrent } from '../shared/universe';
import type { BondModelRecords } from '../shared/types';

setGlobalDispatcher(new EnvHttpProxyAgent());
async function main() {
  const data = await directSource.getUniverse('bond');
  assert.equal(data.mode, 'live');
  assert(data.complete && data.items.length > 150);
  const quotes = Object.fromEntries(data.quotes.map((q) => [q.symbol, q]));
  const pure = data.items.filter((i) => i.bond?.pureBondValue != null);
  assert(pure.length > data.items.length * 0.8, '必须取得独立来源纯债估值，不能从成交价推测');
  const eligible = data.items.filter(
    (i) =>
      i.underlying &&
      i.bond?.redemptionPrice &&
      !i.bond.redeemNoticeDate &&
      quotes[i.symbol]?.timestamp,
  );
  const requests = [
    ...new Map(
      eligible.map((i) => [
        modelKey(i.underlying!, quotes[i.symbol].timestamp!.slice(0, 10)),
        { symbol: i.underlying!, asOf: quotes[i.symbol].timestamp!.slice(0, 10) },
      ]),
    ).values(),
  ];
  const records: BondModelRecords = {};
  let processed = 0;
  await mapConcurrent(requests, 3, async (r) => {
    records[modelKey(r.symbol, r.asOf)] = await directSource.getBondModelInputs(r.symbol, r.asOf);
    if (++processed % 30 === 0) console.log(`参数已检查 ${processed}/${requests.length}`);
  });
  const values = data.items.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    value: bondModelValuation(
      item,
      quotes[item.symbol],
      item.underlying ? quotes[item.underlying] : undefined,
      undefined,
      item.underlying && quotes[item.symbol]?.timestamp
        ? records[modelKey(item.underlying, quotes[item.symbol].timestamp!.slice(0, 10))]
        : undefined,
    ),
  }));
  const calculated = values.filter((v) => v.value.theoreticalValue != null);
  for (const v of calculated) {
    assert(v.value.optionValue! >= 0 && Number.isFinite(v.value.optionValue));
    assert(
      Math.abs(v.value.theoreticalValue! - v.value.pureBondValue! - v.value.optionValue!) < 1e-9,
    );
    assert(Number.isFinite(v.value.theoreticalDeviation));
  }
  for (const item of data.items.filter((i) => i.bond?.redeemNoticeDate))
    assert.equal(values.find((v) => v.symbol === item.symbol)!.value.theoreticalValue, null);
  const summary = {
    total: data.items.length,
    pureValues: pure.length,
    eligible: eligible.length,
    stockRequests: requests.length,
    modelInputs: Object.values(records).filter((r) => r.available).length,
    optionValues: values.filter((v) => v.value.optionValue != null).length,
    theoreticalValues: calculated.length,
    pureDates: [...new Set(pure.map((i) => i.bond!.pureBondDate))],
    treasuryDates: [...new Set(Object.values(records).map((r) => r.treasuryDate))],
  };
  const report = { summary, universe: data, records, values };
  if (process.env.BOND_MODEL_REPORT)
    writeFileSync(process.env.BOND_MODEL_REPORT, JSON.stringify(report));
  console.log(JSON.stringify(summary));
  console.log(
    JSON.stringify({
      reasons: Object.fromEntries(
        [...new Set(values.map((v) => v.value.reason))].map((r) => [
          r,
          values.filter((v) => v.value.reason === r).length,
        ]),
      ),
    }),
  );
  console.log(JSON.stringify(calculated.slice(0, 3)));
  assert(
    calculated.length > eligible.length * 0.6,
    '大部分适用条款的证券应能取得真实历史参数并计算',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
