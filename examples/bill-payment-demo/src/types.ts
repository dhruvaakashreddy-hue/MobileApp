export interface Bill {
  id: string;
  label: string;
  amountInRupees: number;
}

/** The three methods offered in the sheet. */
export type PaymentMethod = 'upi' | 'card' | 'wallet';

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  bill: Bill;
}
