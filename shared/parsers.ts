import { findInstrument, validSymbol } from './catalog';
import type { Candle, Instrument, IPO, Quote } from './types';

const number = (value: string | undefined): number | null => {
  if (value == null || value.trim() === '' || value === '-' || value === '--') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function parseTimestamp(value?: string): string | null {
  if (!value) return null;
  if (/^\d{14}$/.test(value))
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    return `${value.replaceAll('/', '-').replace(' ', 'T')}+08:00`;
  return null;
}

export function parseQuotes(text: string): Quote[] {
  const quotes: Quote[] = [];
  for (const match of text.matchAll(/v_([a-zA-Z0-9]+)="([^"]*)"/g)) {
    const [, symbol, raw] = match;
    if (!validSymbol(symbol)) continue;
    const f = raw.split('~');
    const price = number(f[3]);
    const previousClose = number(f[4]);
    if (!f[1] || !price || !previousClose || f.length < 33) continue;
    const isHK = symbol.startsWith('hk');
    const extendedHK = isHK && /^(HKD|CNY)$/.test(f[75] ?? '');
    const extendedA = !isHK && /^GP-A(?:-|$)/.test(f[61] ?? '') && f[82] === 'CNY';
    const instrument = {
      ...findInstrument(symbol, f[1]),
      name: f[1],
      ...(extendedHK && f[63] === 'GP-FUND-REITS' ? { type: 'reit' as const } : {}),
    };
    // 港股的 31/32 为成交额/涨跌额；沪深的 31/32 为涨跌额/涨跌幅。
    // 涨跌幅统一用现价与昨收计算，避免两个市场字段位置差异。
    const change = price - previousClose;
    const timestamp = parseTimestamp(f[30]);
    quotes.push({
      ...instrument,
      price,
      previousClose,
      open: number(f[5]) ?? price,
      high: number(f[33]) ?? price,
      low: number(f[34]) ?? price,
      change: Number(change.toFixed(4)),
      changePercent: Number(((change / previousClose) * 100).toFixed(4)),
      volume: number(f[6]),
      // HK 37 为报价币种金额，沪深 37 为万元；HK 的38是占位，换手率在59。
      turnover: isHK
        ? extendedHK
          ? number(f[37])
          : null
        : number(f[37]) === null
          ? null
          : Number(f[37]) * 10000,
      turnoverRate: isHK ? (extendedHK ? number(f[59]) : null) : number(f[38]),
      pe: isHK && !extendedHK ? null : number(f[39]),
      pb: isHK ? (extendedHK ? number(f[58]) : null) : number(f[46]),
      // 腾讯扩展股票协议：A股64 / 港股47为源端股息率，百分数；未识别协议保持缺失。
      dividendYield: extendedHK || extendedA ? nonnegative(f[isHK ? 47 : 64]) : null,
      dividendPerShare: extendedHK ? nonnegative(f[72]) : null,
      securityClass: extendedHK ? f[63] : extendedA ? f[61] : undefined,
      marketCap:
        isHK && !extendedHK ? null : number(f[45]) === null ? null : Number(f[45]) * 100000000,
      timestamp,
      currency: extendedHK && f[75] === 'CNY' ? 'CNY' : isHK ? 'HKD' : 'CNY',
      source: 'tencent',
    });
  }
  return quotes;
}

function nonnegative(value: string | undefined) {
  const n = number(value);
  return n != null && n >= 0 ? n : null;
}

export function parseHistory(payload: unknown, symbol: string): Candle[] {
  const record = (payload as { data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }> })
    ?.data?.[symbol];
  const rows = record?.qfqday ?? record?.day;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const [date, open, close, high, low, volume] = row;
    const values = [open, close, high, low, volume].map((x) => Number(x));
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !values.every(Number.isFinite) ||
      values.slice(0, 4).some((x) => x <= 0)
    )
      return [];
    return [
      {
        date,
        open: values[0],
        close: values[1],
        high: values[2],
        low: values[3],
        volume: values[4],
      },
    ];
  });
}

export function parseSearch(text: string): Instrument[] {
  // 腾讯搜索返回字符串字面量中的 \u 中文转义，不执行远端 JavaScript。
  const content = text.match(/v_hint="([^"\n]*)"/)?.[1];
  if (!content) return [];
  const decoded = content.replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded.split('^').flatMap((entry) => {
    const [market, code, name] = entry.split('~');
    const symbol = `${market}${code}`;
    return validSymbol(symbol) && name ? [{ ...findInstrument(symbol, name), name }] : [];
  });
}

export function parseIPOs(payload: unknown): IPO[] {
  const rows = (payload as { result?: { data?: Record<string, unknown>[] } })?.result?.data;
  if (!Array.isArray(rows)) return [];
  const date = (value: unknown) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  return rows.flatMap((row) => {
    const code = String(row.SECURITY_CODE ?? '');
    const name = row.SECURITY_NAME;
    if (!/^\d{6}$/.test(code) || typeof name !== 'string' || !name) return [];
    const issuePrice = number(String(row.ISSUE_PRICE ?? ''));
    return [
      {
        code,
        name,
        applyCode: /^\d{6}$/.test(String(row.APPLY_CODE)) ? String(row.APPLY_CODE) : null,
        applyDate: date(row.APPLY_DATE),
        listingDate: date(row.LISTING_DATE),
        issuePrice: issuePrice && issuePrice > 0 ? issuePrice : null,
      },
    ];
  });
}
