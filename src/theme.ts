export const C = {
  bg: '#f5f7f8',
  card: '#ffffff',
  ink: '#182b2b',
  muted: '#82908f',
  line: '#eaf0ee',
  primary: '#087f70',
  soft: '#e8f5ef',
  up: '#e05b55',
  down: '#159b7b',
  amber: '#ac792f',
  amberBg: '#fff7e6',
};
export const font = { fontFamily: 'System' };
export function price(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}
export function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
export function compact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return price(value, 0);
}
export function quoteTime(timestamp: string | null | undefined, full = false) {
  if (!timestamp) return '更新时间未知';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '更新时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    ...(full ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
