import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { CATALOG } from '../shared/catalog';

let server: Server;
let base: string;
before(async () => {
  process.env.MARKET_DATA_MODE = 'demo';
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
test('行情API明确标注演示来源、币种和固定报价时间', async () => {
  const response = await fetch(`${base}/api/quotes?symbols=sh600519,hk00700`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'demo');
  assert.equal(body.quotes.length, 2);
  assert.equal(body.quotes[1].currency, 'HKD');
  assert(
    body.quotes.every(
      (q: { source: string; timestamp: string }) =>
        q.source === 'demo' && q.timestamp.startsWith('2025-03-14'),
    ),
  );
  assert.match(body.message, /演示/);
});
test('完整目录可以一次查询且不遗漏数据', async () => {
  const response = await fetch(
    `${base}/api/quotes?symbols=${CATALOG.map((x) => x.symbol).join(',')}`,
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.quotes.length, CATALOG.length);
  assert.deepEqual(body.missing, []);
});
test('非法输入返回400，未知代码列为缺失而非生成假报价', async () => {
  for (const query of ['', '../foo', 'sh600519<script>']) {
    const response = await fetch(`${base}/api/quotes?symbols=${encodeURIComponent(query)}`);
    assert.equal(response.status, 400);
  }
  const body = await (await fetch(`${base}/api/quotes?symbols=sh999999`)).json();
  assert.deepEqual(body.quotes, []);
  assert.deepEqual(body.missing, ['sh999999']);
});
test('日线API返回90条标记为演示的数据', async () => {
  const response = await fetch(`${base}/api/history/hk00700`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'demo');
  assert.equal(body.candles.length, 90);
});
test('搜索、健康检查和错误路由返回有效响应', async () => {
  const search = await (await fetch(`${base}/api/search?q=txkg`)).json();
  assert.equal(search.results[0].symbol, 'hk00700');
  assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
});

test('演示模式不伪造新股申购信息', async () => {
  const body = await (await fetch(`${base}/api/ipo`)).json();
  assert.equal(body.available, false);
  assert.deepEqual(body.items, []);
});

test('股息接口限制范围，离线不生成股息率或五年均值', async () => {
  assert.equal((await fetch(`${base}/api/income/all`)).status, 400);
  for (const scope of ['a', 'hk', 'hkreit']) {
    const response = await fetch(`${base}/api/income/${scope}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.scope, scope);
    assert.equal(data.mode, 'demo');
    assert.equal(data.directoryComplete, false);
    assert.deepEqual(data.quotes, []);
    assert.match(data.message, /不生成演示股息率/);
  }
});

test('全市场及REITs指标接口校验类型，演示样本不冒充完整名单', async () => {
  const response = await fetch(`${base}/api/universe/bond`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.kind, 'bond');
  assert.equal(data.complete, false);
  assert.equal(data.total, null);
  assert.equal(data.mode, 'demo');
  assert.match(data.message, /不能代表全市场/);
  assert.equal((await fetch(`${base}/api/universe/stock`)).status, 400);
  assert.equal((await fetch(`${base}/api/reit/sh600519`)).status, 400);
  const metrics = await (await fetch(`${base}/api/reit/sh508056`)).json();
  assert.equal(metrics.available, false);
  assert.equal(metrics.metrics, null);
});
