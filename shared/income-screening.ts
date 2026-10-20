import { boundNumber, normalizeBound, type RangeFilter } from './screening';
import type { Instrument, Quote } from './types';

export const INCOME_FIELDS = [
  { key: 'dividendYield', label: '股息率', unit: '%', signed: false },
  { key: 'price', label: '价格', unit: '报价币种', signed: false },
  { key: 'pe', label: 'PE-TTM', unit: '倍', signed: true },
  { key: 'pb', label: 'PB', unit: '倍', signed: true },
] as const;
export type IncomeMetric = (typeof INCOME_FIELDS)[number]['key'];
export interface IncomeFilters {
  watchOnly: boolean;
  profitableOnly: boolean;
  ranges: Partial<Record<IncomeMetric, RangeFilter>>;
}
export const emptyIncomeFilters = (): IncomeFilters => ({
  watchOnly: false,
  profitableOnly: false,
  ranges: {},
});
export function incomeFilterError(filters: IncomeFilters): string {
  for (const f of INCOME_FIELDS) {
    const range = filters.ranges[f.key];
    if (!range) continue;
    const min = boundNumber(range.min, f.unit === '%'),
      max = boundNumber(range.max, f.unit === '%');
    if ((range.min.trim() && min == null) || (range.max.trim() && max == null))
      return `${f.label}：请输入有效数字`;
    if (!f.signed && ((min != null && min < 0) || (max != null && max < 0)))
      return `${f.label}：不能小于0`;
    if (min != null && max != null && min > max) return `${f.label}：最低值不能大于最高值`;
  }
  return '';
}
export function readIncomeFilters(raw: string | null): IncomeFilters | null {
  if (!raw) return emptyIncomeFilters();
  try {
    if (raw.length > 5000) return null;
    const f = JSON.parse(raw);
    if (
      !f ||
      typeof f.watchOnly !== 'boolean' ||
      typeof f.profitableOnly !== 'boolean' ||
      !f.ranges ||
      typeof f.ranges !== 'object' ||
      Array.isArray(f.ranges)
    )
      return null;
    for (const [key, value] of Object.entries(f.ranges)) {
      const r = value as RangeFilter;
      if (
        !INCOME_FIELDS.some((x) => x.key === key) ||
        !r ||
        typeof r.min !== 'string' ||
        typeof r.max !== 'string' ||
        r.min.length > 30 ||
        r.max.length > 30
      )
        return null;
    }
    return incomeFilterError(f) ? null : f;
  } catch {
    return null;
  }
}
export function incomeFilterCount(f: IncomeFilters) {
  return (
    Number(f.watchOnly) +
    Number(f.profitableOnly) +
    INCOME_FIELDS.filter((x) => {
      const range = f.ranges[x.key];
      return range && (range.min.trim() || range.max.trim());
    }).length
  );
}
export function matchesIncomeFilters(
  item: Instrument,
  q: Quote | undefined,
  filters: IncomeFilters,
  watchlist: string[],
) {
  if (filters.watchOnly && !watchlist.includes(item.symbol)) return false;
  if (filters.profitableOnly && (q?.pe == null || q.pe <= 0)) return false;
  for (const f of INCOME_FIELDS) {
    const range = filters.ranges[f.key];
    if (!range || (!range.min.trim() && !range.max.trim())) continue;
    const value = q?.[f.key];
    if (value == null || !Number.isFinite(value)) return false;
    const min = boundNumber(range.min, f.unit === '%'),
      max = boundNumber(range.max, f.unit === '%');
    if ((range.min.trim() && min == null) || (range.max.trim() && max == null)) return false;
    const tolerance =
      16 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(min ?? 0), Math.abs(max ?? 0));
    if ((min != null && value < min - tolerance) || (max != null && value > max + tolerance))
      return false;
  }
  return true;
}
export function incomeFilterSummary(f: IncomeFilters) {
  return [
    f.watchOnly ? '仅自选' : '',
    f.profitableOnly ? 'PE为正' : '',
    ...INCOME_FIELDS.map((field) => {
      const range = f.ranges[field.key];
      if (!range || (!range.min.trim() && !range.max.trim())) return '';
      const min = normalizeBound(range.min, field.unit === '%'),
        max = normalizeBound(range.max, field.unit === '%');
      return `${field.label} ${min || '不限'}～${max || '不限'}${field.unit === '%' ? '%' : ''}`;
    }),
  ]
    .filter(Boolean)
    .join(' · ');
}
