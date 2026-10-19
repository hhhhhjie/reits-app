export type Market = 'SH' | 'SZ' | 'HK';
export type AssetType = 'stock' | 'index' | 'etf' | 'lof' | 'reit' | 'bond';
export type DataMode = 'live' | 'demo' | 'cached';
export interface Instrument {
  symbol: string;
  code: string;
  name: string;
  market: Market;
  type: AssetType;
  keywords?: string;
  underlying?: string;
}
export interface Quote extends Instrument {
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number | null;
  turnover: number | null;
  turnoverRate: number | null;
  pe: number | null;
  marketCap: number | null;
  timestamp: string | null;
  currency: 'CNY' | 'HKD';
  source: 'tencent' | 'demo';
}
export interface QuoteResponse {
  quotes: Quote[];
  mode: DataMode;
  fetchedAt: string;
  message?: string;
  missing: string[];
}
export interface Candle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}
export interface HistoryResponse {
  candles: Candle[];
  mode: DataMode;
  message?: string;
}
export type DataModule = 'bond' | 'etf' | 'lof' | 'reit' | 'ah' | 'ipo';
export interface IPO {
  code: string;
  name: string;
  applyCode: string | null;
  applyDate: string | null;
  listingDate: string | null;
  issuePrice: number | null;
}
export interface IPOResponse {
  items: IPO[];
  available: boolean;
  message?: string;
  fetchedAt: string;
}
