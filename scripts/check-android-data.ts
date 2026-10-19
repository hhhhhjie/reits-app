import assert from 'node:assert/strict';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { directSource } from '../src/direct-source';

// 用云环境既有代理验证 Android 使用的同一套 fetch / GB18030 解码代码。
setGlobalDispatcher(new EnvHttpProxyAgent());
async function main() {
  const data = await directSource.getQuotes(['sh600519', 'hk00700', 'sh113052']);
  assert.equal(data.mode, 'live');
  assert(data.quotes.some((q) => q.name === '贵州茅台' && q.currency === 'CNY'));
  assert(data.quotes.some((q) => q.name === '腾讯控股' && q.currency === 'HKD'));
  assert(data.quotes.every((q) => q.source === 'tencent' && q.timestamp && q.price > 0));
  console.log('Android 直连适配器：真实 A股、港股、转债报价与 GB18030 中文解码通过');
  const history = await directSource.getHistory('hk00700');
  assert.equal(history.mode, 'live');
  assert(history.candles.length >= 20);
  const search = await directSource.searchInstruments('601888');
  assert.equal(search.scope, 'remote');
  assert(search.results.some((item) => item.symbol === 'sh601888'));
  const ipo = await directSource.getIPOs();
  assert(ipo.available && ipo.items.some((item) => item.applyCode && item.applyDate));
  console.log(
    `Android 直连适配器：${history.candles.length}条港股日线、全市场搜索、${ipo.items.length}条新股日历通过`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
