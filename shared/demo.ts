import { findInstrument } from './catalog';
import type { Candle, Quote } from './types';

const SAMPLES: Record<string, [number, number]> = {
  sh000001: [3348.2, 0.73],
  sz399001: [10742.83, 1.21],
  sz399006: [2216.56, 1.64],
  hkHSI: [23891.64, -0.48],
  hkHSTECH: [5815.32, 0.92],
  sh000300: [3935.77, 0.84],
  sh600519: [1486.5, 1.24],
  sz300750: [263.8, 2.36],
  sh601318: [52.35, -0.48],
  sh600036: [43.62, 0.69],
  sz000333: [72.18, -1.07],
  sz002594: [286.32, 2.15],
  sh601899: [19.25, 1.48],
  sh601398: [6.38, 0.47],
  sz000001: [11.89, -0.58],
  sh601166: [20.72, 0.92],
  sh601009: [10.58, 0.38],
  sz002714: [43.21, -0.55],
  sz300498: [17.82, 0.62],
  sh600438: [23.18, -0.47],
  sh601012: [17.63, 1.23],
  hk00700: [518.5, 1.87],
  hk09988: [128.8, -1.23],
  hk03690: [148.6, 2.06],
  hk01810: [52.35, 3.15],
  hk00941: [84.15, -0.35],
  hk00939: [6.82, 0.74],
  hk01211: [266.4, 1.6],
  hk02318: [46.3, -0.64],
  hk03968: [42.9, 0.82],
  hk02899: [18.12, 1.29],
  sh510300: [3.986, 0.88],
  sh510500: [6.142, 1.12],
  sh588000: [1.089, 1.78],
  sz159915: [2.158, 1.42],
  sh518880: [7.218, -0.31],
  sh513100: [1.672, 0.66],
  sh513180: [0.812, 1.63],
  sz161725: [0.856, -0.81],
  sz161226: [1.142, 1.15],
  sz163407: [2.186, 0.74],
  sh508056: [3.682, 0.74],
  sh508000: [2.984, -0.37],
  sh508099: [2.568, 1.18],
  sz180101: [2.386, 0.25],
  sz180201: [9.842, -0.46],
  sh113052: [116.82, 0.86],
  sh113050: [128.54, 1.12],
  sz127045: [113.65, -0.42],
  sz123107: [121.38, 0.65],
  sh110085: [105.47, -0.28],
  sh113053: [108.92, 1.46],
};

export function demoQuote(symbol: string): Quote | null {
  const sample = SAMPLES[symbol];
  if (!sample) return null;
  const instrument = findInstrument(symbol);
  const [price, changePercent] = sample;
  const previousClose = price / (1 + changePercent / 100);
  const seed = Array.from(symbol).reduce((a, b) => a + b.charCodeAt(0), 0);
  return {
    ...instrument,
    price,
    previousClose,
    changePercent,
    change: price - previousClose,
    open: previousClose * 1.002,
    high: price * 1.012,
    low: previousClose * 0.989,
    volume: seed * 13510,
    turnover: seed * 136210,
    turnoverRate: ((seed % 57) + 2) / 10,
    pe: instrument.type === 'stock' ? (seed % 32) + 8.2 : null,
    marketCap: instrument.type === 'stock' ? seed * 1921000000 : null,
    // 演示快照使用固定日期，绝不生成“刚刚更新”的虚假行情时间。
    timestamp: '2025-03-14T15:00:00+08:00',
    currency: instrument.market === 'HK' ? 'HKD' : 'CNY',
    source: 'demo',
  };
}

export function demoHistory(symbol: string): Candle[] {
  const quote = demoQuote(symbol);
  if (!quote) return [];
  const dates: string[] = [];
  for (
    let day = new Date('2025-03-14T04:00:00Z');
    dates.length < 90;
    day = new Date(day.getTime() - 86400000)
  ) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6)
      dates.unshift(day.toISOString().slice(0, 10));
  }
  return dates.map((date, i) => {
    const base =
      quote.price * (0.9 + 0.1 * (i / 89) + Math.sin(i * 0.7) * 0.013 + Math.cos(i * 0.23) * 0.022);
    const close = i === 89 ? quote.price : base;
    const open = base * (1 + Math.sin(i * 3.3) * 0.009);
    return {
      date,
      open,
      close,
      high: Math.max(open, close) * 1.008,
      low: Math.min(open, close) * 0.992,
      volume: 10000 + ((i * 4781) % 90000),
    };
  });
}
