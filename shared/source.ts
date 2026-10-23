import { CATALOG, searchCatalog, validSymbol } from './catalog';
import type { HistoryResponse, Instrument, IPOResponse, Quote, QuoteResponse } from './types';
import { demoHistory, demoQuote } from './demo';
import { parseHistory, parseIPOs, parseQuotes, parseSearch } from './parsers';
import { createUniverseSource } from './universe';
import { createIncomeSource } from './income';
import { createBondModelSource } from './bond-model-source';

export type TextTransport = (url: string, encoding?: string) => Promise<string>;
export function createMarketSource(request: TextTransport, isDemo: () => boolean = () => false) {
  const lastGood = new Map<string, { quote: Quote; saved: number }>();
  const responses = new Map<string, { value: QuoteResponse; expires: number }>();
  const historyCache = new Map<string, { value: HistoryResponse; expires: number }>();
  const inflight = new Map<string, Promise<QuoteResponse>>();
  const unavailable = '行情源暂不可达，当前为固定演示数据；价格不代表当前市场。';

  let ipoCache: { value: IPOResponse; expires: number } | null = null;
  async function getIPOs(): Promise<IPOResponse> {
    if (ipoCache && ipoCache.expires > Date.now()) return ipoCache.value;
    let result: IPOResponse;
    try {
      if (isDemo()) throw new Error('Demo mode excludes fictitious IPOs');
      const query = Object.entries({
        reportName: 'RPTA_APP_IPOAPPLY',
        columns: 'ALL',
        pageSize: '30',
        pageNumber: '1',
        sortColumns: 'APPLY_DATE',
        sortTypes: '-1',
        source: 'WEB',
        client: 'WEB',
      })
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      const items = parseIPOs(
        JSON.parse(
          await request(`https://datacenter-web.eastmoney.com/api/data/v1/get?${query}`, 'utf-8'),
        ),
      );
      if (!items.length) throw new Error('No IPO records');
      result = { items, available: true, fetchedAt: new Date().toISOString() };
    } catch {
      result = {
        items: [],
        available: false,
        fetchedAt: new Date().toISOString(),
        message: '暂未取得发行日历，可通过下方交易所入口查阅公告。不展示虚拟申购信息。',
      };
    }
    ipoCache = { value: result, expires: Date.now() + (result.available ? 300_000 : 10_000) };
    return result;
  }

  async function getQuotes(symbols: string[]): Promise<QuoteResponse> {
    if (!symbols.length || symbols.length > 150 || !symbols.every(validSymbol))
      throw new Error('Invalid symbols');
    const key = [...symbols].sort().join(',');
    const cached = responses.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const running = inflight.get(key);
    if (running) return running;
    const load = async (): Promise<QuoteResponse> => {
      let result: QuoteResponse;
      try {
        if (isDemo()) throw new Error('Explicit demonstration mode');
        const parsed = parseQuotes(await request(`https://qt.gtimg.cn/q=${symbols.join(',')}`));
        const quotes = parsed.filter((x) => symbols.includes(x.symbol));
        if (!quotes.length) throw new Error('No valid quotes returned');
        quotes.forEach((quote) => lastGood.set(quote.symbol, { quote, saved: Date.now() }));
        result = {
          quotes,
          mode: 'live',
          fetchedAt: new Date().toISOString(),
          missing: symbols.filter((s) => !quotes.some((q) => q.symbol === s)),
          message: '腾讯公开行情；更新时间以每条报价为准，港股可能存在延迟。',
        };
      } catch {
        const previous = symbols.flatMap((s) => {
          const record = lastGood.get(s);
          return record && Date.now() - record.saved < 2 * 60 * 60 * 1000 ? [record.quote] : [];
        });
        if (previous.length && !isDemo()) {
          result = {
            quotes: previous,
            mode: 'cached',
            fetchedAt: new Date().toISOString(),
            missing: symbols.filter((s) => !previous.some((q) => q.symbol === s)),
            message: '行情源连接中断，展示上次成功获取的报价，请注意报价时间。',
          };
        } else {
          const quotes = symbols.flatMap((s) => {
            const q = demoQuote(s);
            return q ? [q] : [];
          });
          result = {
            quotes,
            mode: 'demo',
            fetchedAt: new Date().toISOString(),
            message: unavailable,
            missing: symbols.filter((s) => !quotes.some((q) => q.symbol === s)),
          };
        }
      }
      if (responses.size > 100) responses.clear();
      responses.set(key, { value: result, expires: Date.now() + 10_000 });
      return result;
    };
    const promise = load().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function getHistory(symbol: string): Promise<HistoryResponse> {
    const saved = historyCache.get(symbol);
    if (saved && saved.expires > Date.now()) return saved.value;
    let result: HistoryResponse;
    try {
      if (isDemo()) throw new Error('Explicit demonstration mode');
      const raw = await request(
        `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,90,qfq`,
      );
      const candles = parseHistory(JSON.parse(raw), symbol);
      if (!candles.length) throw new Error('Empty history');
      result = { candles, mode: 'live' };
    } catch {
      result = {
        candles: demoHistory(symbol),
        mode: 'demo',
        message: '演示历史走势，非实际交易记录。',
      };
    }
    if (historyCache.size > 100) historyCache.clear();
    historyCache.set(symbol, {
      value: result,
      expires: Date.now() + (result.mode === 'live' ? 60_000 : 10_000),
    });
    return result;
  }

  async function searchInstruments(
    query: string,
  ): Promise<{ results: Instrument[]; scope: string }> {
    const local = searchCatalog(query);
    if (isDemo()) return { results: local, scope: 'local' };
    try {
      const remote = parseSearch(
        await request(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=all`),
      );
      return {
        results: [
          ...new Map([...local, ...remote].map((item) => [item.symbol, item])).values(),
        ].slice(0, 40),
        scope: 'remote',
      };
    } catch {
      const numeric = /^\d{5,6}$/.test(query)
        ? query.length === 5
          ? [`hk${query}`]
          : [`sh${query}`, `sz${query}`]
        : [];
      // 本地目录未命中时用报价接口确认代码，不将猜测的证券当成搜索结果。
      const candidates = numeric.filter(
        (s) => validSymbol(s) && !CATALOG.some((x) => x.symbol === s),
      );
      let extra: Instrument[] = [];
      if (candidates.length) {
        const quotes = await getQuotes(candidates);
        if (quotes.mode === 'live') extra = quotes.quotes;
      }
      return { results: [...local, ...extra], scope: 'local' };
    }
  }

  const bondModel = createBondModelSource(request, isDemo);
  return {
    getQuotes,
    getHistory,
    searchInstruments,
    getIPOs,
    ...createUniverseSource(request, getQuotes, isDemo, bondModel.getPureBondValues),
    ...createIncomeSource(request, getQuotes, isDemo),
    ...bondModel,
  };
}
