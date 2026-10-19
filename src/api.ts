import { Platform } from 'react-native';
import type { HistoryResponse, Instrument, IPOResponse, QuoteResponse } from '../shared/types';
import { directSource } from './direct-source';

let override = '';
export function setApiUrl(value: string) {
  override = value.replace(/\/$/, '');
}
export function getApiUrl() {
  if (override) return override;
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return __DEV__
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : window.location.origin;
  }
  return '';
}
export function usingDirectSource() {
  return Platform.OS === 'android' && !getApiUrl();
}
async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, { signal: controller.signal });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? '刷新过于频繁，请稍后重试。'
          : `行情服务响应异常（${response.status}）`,
      );
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
export const api = {
  quotes: (symbols: string[]) =>
    usingDirectSource()
      ? directSource.getQuotes(symbols)
      : request<QuoteResponse>(`/api/quotes?symbols=${symbols.join(',')}`),
  history: (symbol: string) =>
    usingDirectSource()
      ? directSource.getHistory(symbol)
      : request<HistoryResponse>(`/api/history/${symbol}`),
  search: (query: string) =>
    usingDirectSource()
      ? directSource.searchInstruments(query)
      : request<{ results: Instrument[]; scope: string }>(
          `/api/search?q=${encodeURIComponent(query)}`,
        ),
  health: async () => {
    if (!usingDirectSource()) return request<{ status: string }>('/api/health');
    const result = await directSource.getQuotes(['sh000001']);
    if (result.mode !== 'live') throw new Error('行情源不可达');
    return { status: 'ok' };
  },
  ipo: () => (usingDirectSource() ? directSource.getIPOs() : request<IPOResponse>('/api/ipo')),
};
