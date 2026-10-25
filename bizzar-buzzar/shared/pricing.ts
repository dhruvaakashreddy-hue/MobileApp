/**
 * Price arithmetic. Pure functions only: the server calls these to compute
 * authoritative amounts, and the browser calls them to display the same numbers.
 */

export interface CheckoutPriceInput {
  salePaise: number;
  shippingFeePaise: number;
  quantity: number;
}

export interface CheckoutPrice {
  currency: string;
  itemPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

export function priceCheckout(input: CheckoutPriceInput, currency = 'INR'): CheckoutPrice {
  const itemPaise = input.salePaise * input.quantity;
  const shippingPaise = input.shippingFeePaise;
  return { currency, itemPaise, shippingPaise, totalPaise: itemPaise + shippingPaise };
}

export interface Savings {
  savingsPaise: number;
  percent: number;
}

/**
 * Savings are only meaningful against evidenced reference prices. Callers must pass
 * null when no stored reference exists for the same product and condition.
 */
export function savingsFor(referencePaise: number | null, salePaise: number): Savings | null {
  if (referencePaise === null || referencePaise <= salePaise) return null;
  const savingsPaise = referencePaise - salePaise;
  return { savingsPaise, percent: Math.floor((savingsPaise * 100) / referencePaise) };
}

export type CostKey = 'procurement' | 'shipping' | 'other' | 'payment_fee';

export interface MarginInput {
  totalPaise: number;
  refundedPaise: number;
  procurementPaise: number | null;
  shippingCostPaise: number | null;
  otherCostPaise: number | null;
  paymentFeePaise: number | null;
}

export type MarginResult =
  | { status: 'complete'; marginPaise: number }
  | { status: 'incomplete'; missing: CostKey[] };

/**
 * A missing cost is never treated as zero. An order whose costs are not all recorded
 * reports which costs are missing instead of a margin that looks better than it is.
 */
export function marginFor(input: MarginInput): MarginResult {
  const costs: [CostKey, number | null][] = [
    ['procurement', input.procurementPaise],
    ['shipping', input.shippingCostPaise],
    ['other', input.otherCostPaise],
    ['payment_fee', input.paymentFeePaise],
  ];
  const missing = costs.filter(([, value]) => value === null).map(([key]) => key);
  if (missing.length > 0) return { status: 'incomplete', missing };
  const costTotal = costs.reduce((sum, [, value]) => sum + (value ?? 0), 0);
  return { status: 'complete', marginPaise: input.totalPaise - input.refundedPaise - costTotal };
}
