import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TextEncoder } from '@kayahr/text-encoding/no-encodings';
import '@kayahr/text-encoding/encodings/gb18030';
import { createMarketSource } from '../shared/source';
import { fetchNativeText } from '../src/direct-source';

const raw = () => {
  const fields = Array(65).fill('');
  Object.assign(fields, {
    0: '1',
    1: '贵州茅台',
    2: '600519',
    3: '110',
    4: '100',
    5: '102',
    30: '20261019150000',
    33: '112',
    34: '99',
  });
  return `v_sh600519="${fields.join('~')}";`;
};
test('行情源故障时保留原始报价时间，并在过期后明确降级演示', async (t) => {
  let clock = 1000000,
    fail = false;
  t.mock.method(Date, 'now', () => clock);
  const source = createMarketSource(async () => {
    if (fail) throw new Error('offline');
    return raw();
  });
  const live = await source.getQuotes(['sh600519']);
  assert.equal(live.mode, 'live');
  fail = true;
  clock += 11000;
  const cached = await source.getQuotes(['sh600519']);
  assert.equal(cached.mode, 'cached');
  assert.equal(cached.quotes[0].timestamp, live.quotes[0].timestamp);
  assert.equal(cached.quotes[0].price, 110);
  clock += 2 * 60 * 60 * 1000;
  const demo = await source.getQuotes(['sh600519']);
  assert.equal(demo.mode, 'demo');
  assert.equal(demo.quotes[0].source, 'demo');
  assert(demo.quotes[0].timestamp?.startsWith('2025-03-14'));
});
test('Android 使用的二进制响应解码保留 GB18030 中文证券名称', async () => {
  const bytes = new TextEncoder('gb18030').encode(raw());
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=gbk' });
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const text = await fetchNativeText(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    );
    assert.equal(text, raw());
    const source = createMarketSource(async () => text);
    assert.equal((await source.getQuotes(['sh600519'])).quotes[0].name, '贵州茅台');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
