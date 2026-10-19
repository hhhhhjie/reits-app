import type { Quote } from './types';
import type { BondMetrics } from './types';

export function bondValuation(bond: Quote, stock?: Quote, conversionPrice?: number) {
  if (
    !stock ||
    !conversionPrice ||
    !Number.isFinite(conversionPrice) ||
    conversionPrice <= 0 ||
    stock.price <= 0 ||
    stock.source !== bond.source
  )
    return null;
  const conversionValue = (stock.price * 100) / conversionPrice;
  const premium = (bond.price / conversionValue - 1) * 100;
  return { conversionValue, premium, doubleLow: bond.price + premium };
}

// 以每百元成交价和未来合同现金流计算税前年化 IRR。到期赎回金额已含末期利息，不重复计息。
export function bondYieldToMaturity(
  terms: BondMetrics,
  dirtyPrice: number,
  asOf: string,
): number | null {
  if (
    !terms.issueDate ||
    !terms.maturityDate ||
    !terms.couponRates ||
    !terms.redemptionPrice ||
    terms.redeemNoticeDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(dirtyPrice) ||
    dirtyPrice <= 0
  )
    return null;
  const start = new Date(`${terms.issueDate}T00:00:00Z`),
    end = Date.parse(`${terms.maturityDate}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const years = Number(terms.maturityDate.slice(0, 4)) - start.getUTCFullYear();
  if (
    years < 1 ||
    years > 10 ||
    terms.couponRates.length !== years ||
    end <= now ||
    Math.abs((end - start.getTime()) / 86400_000 - years * 365.2425) > 7
  )
    return null;
  const flows = terms.couponRates.flatMap((coupon, i) => {
    const payment = new Date(start);
    payment.setUTCFullYear(start.getUTCFullYear() + i + 1);
    const date = i === years - 1 ? end : payment.getTime();
    const amount = i === years - 1 ? terms.redemptionPrice! : coupon;
    if (!Number.isFinite(amount) || amount < 0) return [];
    return date > now ? [{ years: (date - now) / 86400_000 / 365, amount }] : [];
  });
  if (!flows.length) return null;
  const pv = (rate: number) => flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** f.years, 0);
  let lo = -0.9999,
    hi = 1;
  while (pv(hi) > dirtyPrice && hi < 1024) hi = hi * 2 + 1;
  if (pv(lo) < dirtyPrice || pv(hi) > dirtyPrice) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > dirtyPrice) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}
