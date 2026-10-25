/**
 * Wire contract between the API and the browser. Both sides import these types,
 * so a shape change fails the typecheck instead of failing at runtime.
 */
import type { DropPhase, SessionState } from './phase.ts';

export type Condition = 'new' | 'open_box' | 'refurbished';

export interface SpecItem {
  label: string;
  value: string;
}

/** Only fields that are safe before release are present on the reveal path. Product is null until release. */
export interface PublicProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  condition: Condition;
  specs: SpecItem[];
  warrantyText: string;
  returnPolicyText: string;
  shippingEligible: boolean;
  shippingFeePaise: number;
  imageUrl: string | null;
}

export interface PublicPricing {
  currency: string;
  salePaise: number;
  /** Present only when stored evidence exists for this product and condition. */
  referencePaise: number | null;
  referenceCheckedAt: string | null;
  savingsPaise: number | null;
  savingsPercent: number | null;
}

export interface PublicSession {
  id: string;
  name: string;
  windowOpensAt: string;
  windowClosesAt: string;
}

export interface PublicAvailability {
  quantity: number;
  remaining: number;
  /** 'held' means another buyer currently holds the unit. It is not a sale. */
  state: 'available' | 'held' | 'sold';
  heldByYou: boolean;
  yourHold: { reservationId: string; expiresAt: string } | null;
  yourOrderId: string | null;
}

export interface DropState {
  /** Server clock at response time. Browsers derive their clock offset from this. */
  serverNow: string;
  sessionState: SessionState;
  session: PublicSession | null;
  phase: DropPhase | 'none';
  dropId: string | null;
  /** Present from the reveal phase onward. Never present earlier. */
  releaseAt: string | null;
  /** Present from release onward. */
  closesAt: string | null;
  availability: PublicAvailability | null;
  product: PublicProduct | null;
  pricing: PublicPricing | null;
}

export interface PastDrop {
  dropId: string;
  productName: string;
  condition: Condition;
  salePaise: number;
  outcome: 'sold' | 'ended';
  releasedAt: string;
  imageUrl: string | null;
}

export interface PublicConfig {
  brand: string;
  currency: string;
  locale: string;
  timeZone: string;
  shippingCountries: string[];
  paymentMode: 'test' | 'live';
  paymentsConfigured: boolean;
  razorpayKeyId: string | null;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
  emailConfigured: boolean;
  holdSeconds: number;
  revealLeadSeconds: number;
}

export interface AddressView {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  countryCode: string;
}

export interface ReservationView {
  id: string;
  dropId: string;
  status: 'held' | 'paying' | 'paid' | 'expired' | 'released' | 'cancelled';
  statusReason: string | null;
  quantity: number;
  expiresAt: string;
  serverNow: string;
  lateAccepted: boolean;
  product: { name: string; condition: Condition; imageUrl: string | null };
  pricing: { currency: string; itemPaise: number; shippingPaise: number; totalPaise: number };
  orderId: string | null;
  paymentStatus: OrderPaymentStatus | null;
}

export type OrderPaymentStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'failed'
  | 'abandoned'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'needs_review';

export type FulfilmentStatus = 'unfulfilled' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderSummary {
  id: string;
  orderNo: number;
  productName: string;
  condition: Condition;
  quantity: number;
  currency: string;
  totalPaise: number;
  refundedPaise: number;
  paymentStatus: OrderPaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface MeResponse {
  profile: { id: string; email: string; displayName: string | null; isAdmin: boolean };
  alerts: { pushEnabled: boolean; emailReminders: boolean };
  pushSubscribed: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
