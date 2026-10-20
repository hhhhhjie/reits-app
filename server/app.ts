import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { CATALOG, validSymbol } from '../shared/catalog';
import {
  getHistory,
  getIPOs,
  getQuotes,
  searchInstruments,
  getUniverse,
  getReitMetrics,
  getIncome,
} from './provider';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  const buckets = new Map<string, { count: number; reset: number }>();
  app.use('/api', (req, res, next) => {
    const key = req.ip || 'local';
    const bucket = buckets.get(key);
    if (!bucket || bucket.reset <= Date.now())
      buckets.set(key, { count: 1, reset: Date.now() + 60_000 });
    else if (++bucket.count > 180) {
      res.status(429).json({ error: '请求较频繁，请稍后重试。' });
      return;
    }
    if (buckets.size > 5000)
      for (const [ip, value] of buckets) if (value.reset < Date.now()) buckets.delete(ip);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      service: 'zhixing-markets',
      mode: process.env.MARKET_DATA_MODE === 'demo' ? 'demo' : 'auto',
    }),
  );
  app.get('/api/catalog', (_req, res) => res.json({ instruments: CATALOG }));
  app.get('/api/income/:scope', async (req, res) => {
    const scope = req.params.scope;
    if (scope !== 'a' && scope !== 'hk' && scope !== 'hkreit') {
      res.status(400).json({ error: '仅支持沪深A股、港股或港股REITs。' });
      return;
    }
    try {
      res.json(await getIncome(scope));
    } catch {
      res.status(502).json({ error: '股息行情暂不可用。' });
    }
  });
  app.get('/api/universe/:kind', async (req, res) => {
    if (req.params.kind !== 'bond' && req.params.kind !== 'reit') {
      res.status(400).json({ error: '仅支持沪深可转债或REITs。' });
      return;
    }
    try {
      res.json(await getUniverse(req.params.kind));
    } catch {
      res.status(502).json({ error: '全市场目录暂不可用。' });
    }
  });
  app.get('/api/reit/:symbol', async (req, res) => {
    if (!/^(sh508\d{3}|sz180\d{3})$/.test(req.params.symbol)) {
      res.status(400).json({ error: 'REITs代码格式有误。' });
      return;
    }
    try {
      res.json(await getReitMetrics(req.params.symbol));
    } catch {
      res.status(502).json({ error: '净值及分红暂不可用。' });
    }
  });
  app.get('/api/ipo', async (_req, res) => {
    try {
      res.json(await getIPOs());
    } catch {
      res.status(502).json({ error: '新股日历暂不可用。' });
    }
  });
  app.get('/api/quotes', async (req, res) => {
    if (typeof req.query.symbols !== 'string' || req.query.symbols.length > 1800) {
      res.status(400).json({ error: '请提供证券代码。' });
      return;
    }
    const symbols = [...new Set(req.query.symbols.split(',').filter(Boolean))];
    if (!symbols.length || symbols.length > 150 || !symbols.every(validSymbol)) {
      res.status(400).json({ error: '证券代码格式有误或一次查询超过150条。' });
      return;
    }
    try {
      res.json(await getQuotes(symbols));
    } catch {
      res.status(502).json({ error: '行情服务暂不可用，请稍后重试。' });
    }
  });
  app.get('/api/history/:symbol', async (req, res) => {
    if (!validSymbol(req.params.symbol)) {
      res.status(400).json({ error: '证券代码格式有误。' });
      return;
    }
    try {
      res.json(await getHistory(req.params.symbol));
    } catch {
      res.status(502).json({ error: '历史行情暂不可用。' });
    }
  });
  app.get('/api/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 40) {
      res.status(400).json({ error: '请输入1至40字的名称、代码或拼音。' });
      return;
    }
    try {
      res.json(await searchInstruments(q));
    } catch {
      res.status(502).json({ error: '搜索服务暂不可用。' });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
  const dist = path.resolve(process.cwd(), 'dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}
