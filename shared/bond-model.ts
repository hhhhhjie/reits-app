import { beijingDate } from './fundamentals';
import type { BondModelInputs, Quote, TreasuryPoint, UniverseItem } from './types';

const DAY = 86400_000;
export const BOND_MODEL_KEYS = ['optionValue', 'theoreticalValue', 'theoreticalDeviation'];
export const BOND_MODEL_EXPLANATION =
  '纯债价值取东方财富日终估值，保留日期，不是保证兑付价格。期权价值为到期欧式BS估算：转股价值作标的、含末期利息的到期赎回价作行权金额；理论价值＝纯债价值＋期权价值，偏离度＝(现价÷理论价值−1)×100%，正值表示高于模型值。波动率取报价日前60个完整交易日的东方财富日涨跌幅，按ln(1＋日涨跌幅/100)计算收益率样本标准差×√252；不直接用未复权收盘价相除。国债2/5/10/30年率按剩余期限插值，短于2年用2年端点作代理，转为连续复利；股息率用正股来源股息率近似连续分红率。未模拟提前转股、强赎、回售、下修和期权信用风险，不等同集思录模型，不作交易依据；已公告赎回或参数缺失时不计算期权和理论值。';

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dateGap(later: string, earlier: string) {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY;
}
export function interpolateTreasury(curve: TreasuryPoint[], years: number): number | null {
  if (
    !Number.isFinite(years) ||
    years < 0 ||
    !Array.isArray(curve) ||
    !curve.length ||
    curve.some(
      (p) =>
        !p ||
        !Number.isFinite(p.years) ||
        p.years <= 0 ||
        !Number.isFinite(p.rate) ||
        p.rate <= -100,
    )
  )
    return null;
  const points = [...curve].sort((a, b) => a.years - b.years);
  if (new Set(points.map((p) => p.years)).size !== points.length) return null;
  if (years <= points[0].years) return points[0].rate;
  for (let i = 1; i < points.length; i++) {
    if (years <= points[i].years) {
      const left = points[i - 1],
        right = points[i];
      return (
        left.rate + ((right.rate - left.rate) * (years - left.years)) / (right.years - left.years)
      );
    }
  }
  return points[points.length - 1].rate;
}
function normalCDF(x: number) {
  if (x >= 9) return 1;
  if (x <= -9) return 0;
  const z = Math.abs(x),
    t = 1 / (1 + 0.2316419 * z);
  const tail =
    (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
// r/q为连续年率小数，sigma为年化波动率小数；这是欧式看涨期权，不含强赎等路径条款。
export function europeanCall(
  spot: number,
  strike: number,
  years: number,
  r: number,
  q: number,
  sigma: number,
): number | null {
  if (
    ![spot, strike, years, r, q, sigma].every(Number.isFinite) ||
    spot <= 0 ||
    strike <= 0 ||
    years < 0 ||
    sigma < 0
  )
    return null;
  const discountedSpot = spot * Math.exp(-q * years),
    discountedStrike = strike * Math.exp(-r * years);
  if (![discountedSpot, discountedStrike].every(Number.isFinite)) return null;
  if (years === 0 || sigma === 0) return Math.max(0, discountedSpot - discountedStrike);
  const sd = sigma * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (r - q + (sigma * sigma) / 2) * years) / sd,
    d2 = d1 - sd;
  const result = discountedSpot * normalCDF(d1) - discountedStrike * normalCDF(d2);
  return Number.isFinite(result) ? Math.min(discountedSpot, Math.max(0, result)) : null;
}
export function modelKey(symbol: string, asOf: string) {
  return `${symbol}:${asOf}`;
}
export function bondModelValuation(
  item: UniverseItem,
  bond: Quote | undefined,
  stock: Quote | undefined,
  conversion: number | undefined,
  inputs: BondModelInputs | undefined,
) {
  const terms = item.bond,
    asOf = bond?.timestamp?.slice(0, 10) ?? beijingDate();
  const pureDate = terms?.pureBondDate;
  const pure = terms?.pureBondValue;
  const pureBondValue =
    bond?.source !== 'demo' &&
    pure != null &&
    Number.isFinite(pure) &&
    pure > 0 &&
    pureDate &&
    validDate(pureDate) &&
    validDate(asOf) &&
    pureDate <= asOf &&
    dateGap(asOf, pureDate) <= 14
      ? pure
      : null;
  const result = {
    pureBondValue,
    pureBondDate: pureBondValue != null ? pureDate! : null,
    optionValue: null as number | null,
    theoreticalValue: null as number | null,
    theoreticalDeviation: null as number | null,
    modelVolatility: inputs?.volatility ?? null,
    riskFreeRate: null as number | null,
    modelDividendYield: stock?.dividendYield ?? null,
    treasuryDate: inputs?.treasuryDate ?? null,
    volatilityStartDate: inputs?.volatilityStartDate ?? null,
    volatilityEndDate: inputs?.volatilityEndDate ?? null,
    modelStrike: terms?.redemptionPrice ?? null,
    modelYears: null as number | null,
    reason: '',
  };
  const fail = (reason: string) => ({ ...result, reason });
  if (
    !bond ||
    bond.symbol !== item.symbol ||
    bond.source === 'demo' ||
    !bond.timestamp ||
    !validDate(asOf)
  )
    return fail('缺少真实转债报价与日期');
  if (terms?.redeemNoticeDate) return fail('已披露赎回公告，欧式估值不适用');
  if (
    !terms?.maturityDate ||
    !validDate(terms.maturityDate) ||
    !terms.redemptionPrice ||
    !Number.isFinite(terms.redemptionPrice) ||
    terms.redemptionPrice <= 0
  )
    return fail('缺少明确的到期日或含末期利息的到期赎回价');
  const years = dateGap(terms.maturityDate, asOf) / 365;
  result.modelYears = years;
  if (years <= 0 || years > 10) return fail('剩余期限不适用');
  const strikePrice = conversion ?? terms.conversionPrice;
  if (
    !stock ||
    stock.symbol !== item.underlying ||
    stock.source !== bond.source ||
    stock.currency !== 'CNY' ||
    bond.currency !== 'CNY' ||
    stock.timestamp?.slice(0, 10) !== asOf ||
    !Number.isFinite(stock.price) ||
    stock.price <= 0 ||
    !strikePrice ||
    !Number.isFinite(strikePrice) ||
    strikePrice <= 0
  )
    return fail('缺少同交易日正股报价或有效转股价');
  if (
    !inputs ||
    !inputs.available ||
    inputs.symbol !== item.underlying ||
    inputs.asOf !== asOf ||
    inputs.volatility == null ||
    !Number.isFinite(inputs.volatility) ||
    inputs.volatility < 0
  )
    return fail(inputs?.message || '正在取得波动率和国债收益率');
  if (
    inputs.returnCount !== 60 ||
    !inputs.volatilityStartDate ||
    !validDate(inputs.volatilityStartDate) ||
    !inputs.volatilityEndDate ||
    !validDate(inputs.volatilityEndDate) ||
    inputs.volatilityStartDate >= inputs.volatilityEndDate ||
    inputs.volatilityEndDate >= asOf ||
    dateGap(asOf, inputs.volatilityEndDate) > 14 ||
    !inputs.treasuryDate ||
    !validDate(inputs.treasuryDate) ||
    inputs.treasuryDate > asOf ||
    dateGap(asOf, inputs.treasuryDate) > 14
  )
    return fail('模型输入样本不足、日期过旧或晚于报价日期');
  const yieldRate = interpolateTreasury(inputs.treasuryCurve, years),
    dividend = stock.dividendYield;
  result.riskFreeRate = yieldRate;
  if (yieldRate == null || dividend == null || !Number.isFinite(dividend) || dividend < 0)
    return fail('国债年率或正股来源股息率缺失');
  const value = europeanCall(
    (stock.price * 100) / strikePrice,
    terms.redemptionPrice,
    years,
    Math.log1p(yieldRate / 100),
    dividend / 100,
    inputs.volatility / 100,
  );
  if (value == null) return fail('期权估算参数无效');
  result.optionValue = value;
  if (pureBondValue == null)
    return { ...result, reason: '纯债价值缺失或日期过旧，理论价值与偏离度留空' };
  const theoretical = pureBondValue + value;
  result.theoreticalValue = theoretical;
  if (Number.isFinite(bond.price) && bond.price > 0)
    result.theoreticalDeviation = (bond.price / theoretical - 1) * 100;
  return result;
}
