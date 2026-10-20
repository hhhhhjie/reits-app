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
  pb?: number | null;
  dividendYield?: number | null;
  dividendPerShare?: number | null;
  securityClass?: string;
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
export type DataModule = 'bond' | 'dividend' | 'etf' | 'lof' | 'reit' | 'ah' | 'ipo';

export type IncomeScope = 'a' | 'hk' | 'hkreit';
export interface IncomeResponse {
  scope: IncomeScope;
  items: Instrument[];
  quotes: Quote[];
  mode: DataMode;
  directoryComplete: boolean;
  sourceCount: number | null;
  directoryDate: string;
  fetchedAt: string;
  source: string;
  message: string;
}
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

export type UniverseKind = 'bond' | 'reit';
export interface BondMetrics {
  conversionPrice: number | null;
  stockName: string | null;
  rating: string | null;
  issueScale: number | null; // 发行规模，亿元；不等于剩余规模
  issueDate: string | null;
  listingDate: string | null;
  maturityDate: string | null;
  couponRates: number[] | null;
  redemptionPrice: number | null; // 每百元面值，包含最后一期利息
  redeemTriggerPrice: number | null;
  resaleTriggerPrice: number | null;
  redeemNoticeDate: string | null;
  redeemDate: string | null;
  redeemPrice: number | null;
}
export interface UniverseItem extends Instrument {
  bond?: BondMetrics;
  reit?: ReitMetrics;
}
export interface UniverseResponse {
  kind: UniverseKind;
  items: UniverseItem[];
  quotes: Quote[];
  mode: DataMode;
  complete: boolean;
  total: number | null;
  sourceCount: number | null;
  fetchedAt: string;
  directoryUpdatedAt: string;
  source: string;
  message: string;
}
export interface ReitMetrics {
  nav: number;
  navDate: string;
  cumulativeNav: number | null;
  source: 'tencent-fund' | 'eastmoney-fund' | 'mixed';
  cashDistributionTtm: number | null;
  lastDistribution: number | null;
  lastDistributionDate: string | null;
  distributionCount: number;
  coverageStart: string;
  asOfDate: string;
}
export interface ReitMetricsResponse {
  symbol: string;
  available: boolean;
  metrics: ReitMetrics | null;
  fetchedAt: string;
  message?: string;
}
