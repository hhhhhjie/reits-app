import assert from 'node:assert/strict';
import { getHistory, getIPOs, getQuotes, searchInstruments } from '../server/provider';

async function main() {
  const symbols = ['sh600519', 'hk00700', 'sh113052', 'sh510300', 'sh508056'];
  const data = await getQuotes(symbols);
  assert.equal(data.mode, 'live', '行情源不可达，未通过真实行情检查；演示数据不能视为通过');
  assert.equal(data.quotes.length, symbols.length);
  for (const quote of data.quotes) {
    assert(quote.price > 0 && quote.previousClose > 0 && quote.timestamp);
    assert.equal(quote.source, 'tencent');
    console.log(
      `${quote.symbol} ${quote.name} ${quote.price} ${quote.currency} 报价时间=${quote.timestamp}`,
    );
  }
  for (const symbol of ['sh600519', 'hk00700']) {
    const history = await getHistory(symbol);
    assert.equal(history.mode, 'live', `${symbol} 历史行情未接通`);
    assert(history.candles.length >= 20);
    console.log(
      `${symbol} 真实日线 ${history.candles.length} 条，最后日期 ${history.candles.at(-1)?.date}`,
    );
  }
  const search = await searchInstruments('601888');
  assert.equal(search.scope, 'remote');
  assert(search.results.some((x) => x.symbol === 'sh601888'));
  console.log('目录外证券搜索通过：中国中免 sh601888');
  const ipo = await getIPOs();
  assert(ipo.available && ipo.items.length > 0, '新股发行日历未接通');
  assert(ipo.items.some((item) => item.applyCode && item.applyDate));
  console.log(`真实新股日历 ${ipo.items.length} 条，最新申购日期 ${ipo.items[0].applyDate}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
