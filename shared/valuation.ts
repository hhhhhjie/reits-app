import type { Quote } from './types';

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
