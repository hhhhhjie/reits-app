import { EnvHttpProxyAgent, fetch } from 'undici';
import { createMarketSource } from '../shared/source';
const proxyAgent = new EnvHttpProxyAgent();
async function request(url: string, encoding = 'gb18030'): Promise<string> {
  const response = await fetch(url, {
    dispatcher: proxyAgent,
    signal: AbortSignal.timeout(6500),
    headers: { 'User-Agent': 'Mozilla/5.0 ZhixingMarkets/1.0', Referer: 'https://gu.qq.com/' },
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 2_000_000) throw new Error('Upstream response exceeds limit');
  return new TextDecoder(encoding).decode(buffer);
}

export const {
  getQuotes,
  getHistory,
  searchInstruments,
  getIPOs,
  getUniverse,
  getReitMetrics,
  getIncome,
  getBondModelInputs,
} = createMarketSource(request, () => process.env.MARKET_DATA_MODE === 'demo');
