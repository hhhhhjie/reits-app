import { marketMetric } from './market-metrics';
import type { BondModelInputs, Quote, ReitMetrics, UniverseItem, UniverseKind } from './types';

export interface RangeFilter {
  min: string;
  max: string;
}
export interface MarketFilters {
  market: 'all' | 'SH' | 'SZ';
  watchOnly: boolean;
  trend: 'all' | 'up' | 'down';
  ranges: Record<string, RangeFilter>;
  ratings: string[];
  redemption: 'all' | 'exclude_announced' | 'only_announced';
  excludeST: boolean;
}
export interface FilterPreset {
  id: string;
  name: string;
  filters: MarketFilters;
}
export interface KindFilterSettings {
  applied: MarketFilters;
  presets: FilterPreset[];
}
export interface FilterPreferences {
  version: 1;
  bond: KindFilterSettings;
  reit: KindFilterSettings;
}
export interface FilterField {
  key: string;
  label: string;
  unit: string;
  signed?: boolean;
  divisor?: number;
  group: string;
}
const field = (
  key: string,
  label: string,
  unit: string,
  group: string,
  signed = false,
  divisor = 1,
): FilterField => ({ key, label, unit, group, signed, divisor });
export const FILTER_FIELDS: Record<UniverseKind, FilterField[]> = {
  bond: [
    field('price', '现价', '元', '价格与估值'),
    field('premium', '转股溢价率', '%', '价格与估值', true),
    field('doubleLow', '双低值', '点', '价格与估值', true),
    field('conversionValue', '转股价值', '元', '价格与估值'),
    field('conversionPrice', '转股价', '元', '价格与估值'),
    field('pureBondValue', '纯债价值', '元/百元面值', '理论估值'),
    field('optionValue', '期权价值', '元/百元面值', '理论估值'),
    field('theoreticalValue', '理论价值', '元/百元面值', '理论估值'),
    field('theoreticalDeviation', '理论偏离度', '%', '理论估值', true),
    field('ytm', '税前到期收益率估算', '%', '收益与期限', true),
    field('yearsLeft', '剩余年限', '年', '收益与期限'),
    field('issueScale', '发行规模', '亿元', '收益与期限'),
    field('changePercent', '涨跌幅', '%', '交易与正股', true),
    field('turnover', '成交额', '万元', '交易与正股', false, 10000),
    field('turnoverRate', '换手率', '%', '交易与正股'),
    field('stockPrice', '正股价', '元', '交易与正股'),
    field('stockChange', '正股涨跌幅', '%', '交易与正股', true),
  ],
  reit: [
    field('price', '现价', '元', '价格与估值'),
    field('navPremium', '净值溢价率', '%', '价格与估值', true),
    field('nav', '单位净值', '元', '价格与估值'),
    field('distributionYield', '历史现金分派率', '%', '历史分派'),
    field('cashDistributionTtm', '近12月现金分红', '元/份', '历史分派'),
    field('changePercent', '涨跌幅', '%', '交易指标', true),
    field('turnover', '成交额', '万元', '交易指标', false, 10000),
    field('turnoverRate', '换手率', '%', '交易指标'),
    field('marketCap', '总市值', '亿元', '交易指标', false, 100000000),
  ],
};
export const CREDIT_RATINGS = [
  'AAA',
  'AA+',
  'AA',
  'AA-',
  'A+',
  'A',
  'A-',
  'BBB+',
  'BBB',
  'BBB-',
  'BB+',
  'BB',
  'BB-',
  'B+',
  'B',
  'B-',
  'CCC',
  'CC',
  'C',
  'D',
  '未评级',
];
export function emptyMarketFilters(): MarketFilters {
  return {
    market: 'all',
    watchOnly: false,
    trend: 'all',
    ranges: {},
    ratings: [],
    redemption: 'all',
    excludeST: false,
  };
}
export function emptyFilterPreferences(): FilterPreferences {
  return {
    version: 1,
    bond: { applied: emptyMarketFilters(), presets: [] },
    reit: { applied: emptyMarketFilters(), presets: [] },
  };
}
export function normalizeBound(value: string, percentage = false): string {
  let text = value
    .trim()
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/[－−]/g, '-')
    .replace(/＋/g, '+')
    .replace(/．/g, '.')
    .replace(/％/g, '%');
  if (percentage) text = text.replace(/%$/, '').trim();
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replaceAll(',', '');
  return text;
}
export function boundNumber(text: string, percentage = false): number | null {
  const value = normalizeBound(text, percentage);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function filterErrors(filters: MarketFilters, kind: UniverseKind): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of FILTER_FIELDS[kind]) {
    const range = filters.ranges[f.key];
    if (!range) continue;
    const minText = normalizeBound(range.min, f.unit === '%'),
      maxText = normalizeBound(range.max, f.unit === '%');
    const min = boundNumber(minText),
      max = boundNumber(maxText);
    if (
      (range.min.trim() && !minText) ||
      (range.max.trim() && !maxText) ||
      (minText && min == null) ||
      (maxText && max == null)
    )
      errors[f.key] = `${f.label}：请输入有效数字`;
    else if (!f.signed && ((min != null && min < 0) || (max != null && max < 0)))
      errors[f.key] = `${f.label}：不能小于0`;
    else if (min != null && max != null && min > max)
      errors[f.key] = `${f.label}：最低值不能大于最高值`;
  }
  return errors;
}
export function canonicalFilters(filters: MarketFilters, kind: UniverseKind): MarketFilters {
  const ranges: Record<string, RangeFilter> = {};
  for (const f of FILTER_FIELDS[kind]) {
    const range = filters.ranges[f.key];
    if (!range) continue;
    const min = normalizeBound(range.min, f.unit === '%'),
      max = normalizeBound(range.max, f.unit === '%');
    if (min || max) ranges[f.key] = { min, max };
  }
  return {
    ...filters,
    ranges,
    ratings: kind === 'bond' ? [...new Set(filters.ratings)] : [],
    redemption: kind === 'bond' ? filters.redemption : 'all',
    excludeST: kind === 'bond' && filters.excludeST,
  };
}
export function ratingOf(item: UniverseItem): string {
  return item.bond?.rating?.replace(/\s|级/g, '') || '未评级';
}
export function matchesMarketFilters(
  item: UniverseItem,
  filters: MarketFilters,
  kind: UniverseKind,
  quotes: Record<string, Quote>,
  watchlist: string[],
  conversions: Record<string, number>,
  reit?: ReitMetrics | null,
  model?: BondModelInputs,
): boolean {
  if (filters.market !== 'all' && item.market !== filters.market) return false;
  if (filters.watchOnly && !watchlist.includes(item.symbol)) return false;
  const q = quotes[item.symbol];
  if (
    filters.trend !== 'all' &&
    (!q || (filters.trend === 'up' ? q.changePercent <= 0 : q.changePercent >= 0))
  )
    return false;
  if (kind === 'bond') {
    if (filters.ratings.length && !filters.ratings.includes(ratingOf(item))) return false;
    const announced = !!item.bond?.redeemNoticeDate;
    if (filters.redemption === 'exclude_announced' && announced) return false;
    if (filters.redemption === 'only_announced' && !announced) return false;
    const name =
      item.bond?.stockName ?? (item.underlying ? quotes[item.underlying]?.name : undefined) ?? '';
    if (filters.excludeST && /^(?:\*?ST|S\*?ST)/i.test(name.trim())) return false;
  }
  for (const field of FILTER_FIELDS[kind]) {
    const range = filters.ranges[field.key];
    if (!range || (!range.min.trim() && !range.max.trim())) continue;
    const raw = marketMetric(item, field.key, quotes, conversions[item.symbol], reit, model);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
    const value = raw / (field.divisor ?? 1);
    for (const side of ['min', 'max'] as const) {
      if (!normalizeBound(range[side], field.unit === '%')) continue;
      const bound = boundNumber(range[side], field.unit === '%');
      if (bound == null) return false;
      const tolerance = 16 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(bound));
      if (side === 'min' ? value < bound - tolerance : value > bound + tolerance) return false;
    }
  }
  return true;
}
export interface FilterChip {
  key: string;
  label: string;
}
export function activeFilterChips(filters: MarketFilters, kind: UniverseKind): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.market !== 'all')
    chips.push({ key: 'market', label: filters.market === 'SH' ? '沪市' : '深市' });
  if (filters.watchOnly) chips.push({ key: 'watchOnly', label: '仅自选' });
  if (filters.trend !== 'all')
    chips.push({ key: 'trend', label: filters.trend === 'up' ? '上涨' : '下跌' });
  for (const f of FILTER_FIELDS[kind]) {
    const range = filters.ranges[f.key];
    if (!range) continue;
    const min = normalizeBound(range.min, f.unit === '%'),
      max = normalizeBound(range.max, f.unit === '%');
    if (!min && !max) continue;
    const unit = f.unit === '点' ? '' : f.unit;
    const label =
      min && max
        ? `${min}≤${f.label}≤${max}${unit}`
        : min
          ? `${f.label}≥${min}${unit}`
          : `${f.label}≤${max}${unit}`;
    chips.push({ key: `range:${f.key}`, label });
  }
  if (kind === 'bond') {
    if (filters.ratings.length)
      chips.push({ key: 'ratings', label: `评级 ${filters.ratings.join('、')}` });
    if (filters.redemption !== 'all')
      chips.push({
        key: 'redemption',
        label: filters.redemption === 'exclude_announced' ? '排除已公告赎回' : '只看已公告赎回',
      });
    if (filters.excludeST) chips.push({ key: 'excludeST', label: '排除已标记ST正股' });
  }
  return chips;
}
export function clearFilter(filters: MarketFilters, key: string): MarketFilters {
  if (key.startsWith('range:')) {
    const ranges = { ...filters.ranges };
    delete ranges[key.slice(6)];
    return { ...filters, ranges };
  }
  if (key === 'ratings') return { ...filters, ratings: [] };
  const defaults = emptyMarketFilters();
  return { ...filters, [key]: defaults[key as keyof MarketFilters] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function readMarketFilters(value: unknown, kind: UniverseKind): MarketFilters | null {
  if (
    !isObject(value) ||
    !['all', 'SH', 'SZ'].includes(String(value.market)) ||
    typeof value.watchOnly !== 'boolean' ||
    !['all', 'up', 'down'].includes(String(value.trend)) ||
    !isObject(value.ranges) ||
    !Array.isArray(value.ratings) ||
    !value.ratings.every((r) => typeof r === 'string' && CREDIT_RATINGS.includes(r)) ||
    !['all', 'exclude_announced', 'only_announced'].includes(String(value.redemption)) ||
    typeof value.excludeST !== 'boolean'
  )
    return null;
  const keys = FILTER_FIELDS[kind].map((f) => f.key);
  for (const [key, range] of Object.entries(value.ranges)) {
    if (
      !keys.includes(key) ||
      !isObject(range) ||
      typeof range.min !== 'string' ||
      typeof range.max !== 'string' ||
      range.min.length > 30 ||
      range.max.length > 30
    )
      return null;
  }
  const filters = value as unknown as MarketFilters;
  if (Object.keys(filterErrors(filters, kind)).length) return null;
  return canonicalFilters(filters, kind);
}
export function decodeFilterPreferences(text: string): FilterPreferences | null {
  try {
    if (text.length > 100000) return null;
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw) || raw.version !== 1) return null;
    const result = emptyFilterPreferences();
    for (const kind of ['bond', 'reit'] as const) {
      const saved = raw[kind];
      if (!isObject(saved) || !Array.isArray(saved.presets) || saved.presets.length > 10)
        return null;
      const applied = readMarketFilters(saved.applied, kind);
      if (!applied) return null;
      const presets: FilterPreset[] = [];
      for (const preset of saved.presets) {
        if (
          !isObject(preset) ||
          typeof preset.id !== 'string' ||
          !preset.id ||
          preset.id.length > 64 ||
          typeof preset.name !== 'string' ||
          !preset.name.trim() ||
          preset.name.length > 20
        )
          return null;
        const filters = readMarketFilters(preset.filters, kind);
        if (!filters) return null;
        presets.push({ id: preset.id, name: preset.name.trim(), filters });
      }
      if (
        new Set(presets.map((p) => p.id)).size !== presets.length ||
        new Set(presets.map((p) => p.name)).size !== presets.length
      )
        return null;
      result[kind] = { applied, presets };
    }
    return result;
  } catch {
    return null;
  }
}
export function upsertFilterPreset(
  settings: KindFilterSettings,
  name: string,
  filters: MarketFilters,
  kind: UniverseKind,
): KindFilterSettings {
  const clean = name.trim();
  if (!clean || clean.length > 20) throw new Error('方案名称需为1至20字');
  const validated = readMarketFilters(filters, kind);
  if (!validated) throw new Error('请先修正筛选范围');
  const existing = settings.presets.find((p) => p.name === clean);
  if (!existing && settings.presets.length >= 10)
    throw new Error('每类最多保存10套方案，请先删除一套');
  const preset: FilterPreset = {
    id: existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: clean,
    filters: validated,
  };
  return {
    ...settings,
    presets: existing
      ? settings.presets.map((p) => (p.id === existing.id ? preset : p))
      : [...settings.presets, preset],
  };
}
