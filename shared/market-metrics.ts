import type { Quote, ReitMetrics, UniverseItem, UniverseKind } from './types';
import { bondValuation, bondYieldToMaturity } from './valuation';

export type MetricFormat = 'price' | 'percent' | 'amount' | 'number' | 'text' | 'years';
export interface MetricColumn {
  key: string;
  label: string;
  format: MetricFormat;
}
const col = (key: string, label: string, format: MetricFormat = 'price'): MetricColumn => ({
  key,
  label,
  format,
});
export const METRIC_GROUPS: Record<UniverseKind, { label: string; columns: MetricColumn[] }[]> = {
  bond: [
    {
      label: '核心指标',
      columns: [
        col('price', '现价'),
        col('changePercent', '涨跌幅', 'percent'),
        col('premium', '转股溢价', 'percent'),
        col('doubleLow', '双低值'),
        col('ytm', '税前YTM估算', 'percent'),
        col('yearsLeft', '剩余年限', 'years'),
        col('turnover', '成交额', 'amount'),
      ],
    },
    {
      label: '正股与转股',
      columns: [
        col('stockPrice', '正股价'),
        col('stockChange', '正股涨幅', 'percent'),
        col('conversionPrice', '转股价'),
        col('conversionValue', '转股价值'),
        col('premium', '转股溢价', 'percent'),
        col('redeemTriggerPrice', '强赎触发价'),
        col('resaleTriggerPrice', '回售触发价'),
      ],
    },
    {
      label: '期限与风险',
      columns: [
        col('rating', '评级', 'text'),
        col('issueScale', '发行规模(亿)', 'number'),
        col('maturityDate', '到期日', 'text'),
        col('redemptionPrice', '到期赎回价'),
        col('redeemStatus', '赎回公告', 'text'),
        col('redeemNoticeDate', '公告日', 'text'),
        col('redeemDate', '赎回日', 'text'),
        col('turnoverRate', '换手率', 'percent'),
      ],
    },
  ],
  reit: [
    {
      label: '交易指标',
      columns: [
        col('price', '现价'),
        col('changePercent', '涨跌幅', 'percent'),
        col('turnover', '成交额', 'amount'),
        col('turnoverRate', '换手率', 'percent'),
        col('amplitude', '振幅', 'percent'),
        col('marketCap', '总市值', 'amount'),
      ],
    },
    {
      label: '净值与分派',
      columns: [
        col('price', '现价'),
        col('nav', '单位净值'),
        col('navDate', '净值日期', 'text'),
        col('cumulativeNav', '累计净值'),
        col('navPremium', '净值溢价率', 'percent'),
        col('cashDistributionTtm', '近12月分红/份'),
        col('distributionYield', '历史现金分派率', 'percent'),
        col('lastDistribution', '最近分红/份'),
        col('lastDistributionDate', '分红记录日', 'text'),
      ],
    },
  ],
};
export type MetricValue = number | string | null;
export function marketMetric(
  item: UniverseItem,
  key: string,
  quotes: Record<string, Quote>,
  conversion?: number,
  reit?: ReitMetrics | null,
): MetricValue {
  const q = quotes[item.symbol];
  const stock = item.underlying ? quotes[item.underlying] : undefined;
  const terms = item.bond;
  const conversionPrice = conversion ?? terms?.conversionPrice ?? undefined;
  const valuation = q ? bondValuation(q, stock, conversionPrice) : null;
  if (key === 'premium' || key === 'doubleLow' || key === 'conversionValue')
    return valuation?.[key] ?? null;
  if (key === 'conversionPrice') return conversionPrice ?? null;
  if (key === 'stockPrice') return stock?.price ?? null;
  if (key === 'stockChange') return stock?.changePercent ?? null;
  if (key === 'ytm')
    return q && q.source !== 'demo' && terms && q.timestamp
      ? bondYieldToMaturity(terms, q.price, q.timestamp.slice(0, 10))
      : null;
  if (key === 'yearsLeft')
    return terms?.maturityDate && q?.timestamp
      ? Math.max(
          0,
          (Date.parse(terms.maturityDate) - Date.parse(q.timestamp.slice(0, 10))) / 86400_000 / 365,
        )
      : null;
  if (key === 'redeemStatus') return terms?.redeemNoticeDate ? '已披露公告' : null;
  if (terms && key in terms)
    return (terms as unknown as Record<string, number | string | null>)[key] ?? null;
  if (key === 'navPremium')
    return reit && q && q.source !== 'demo' ? (q.price / reit.nav - 1) * 100 : null;
  if (key === 'distributionYield')
    return reit?.cashDistributionTtm != null && q && q.source !== 'demo'
      ? (reit.cashDistributionTtm / q.price) * 100
      : null;
  if (reit && key in reit)
    return (reit as unknown as Record<string, number | string | null>)[key] ?? null;
  if (key === 'amplitude')
    return q && q.previousClose > 0 ? ((q.high - q.low) / q.previousClose) * 100 : null;
  if (q && key in q) {
    const value = (q as unknown as Record<string, unknown>)[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
}
