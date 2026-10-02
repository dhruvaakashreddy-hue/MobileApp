import { supabase } from './supabase';

export type PaymentPlan = 'weekly' | 'monthly';

export interface PaymentProvider {
  createOrder(plan: PaymentPlan): Promise<{ order_id: string; amount: number }>;
  verifyPayment(
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<boolean>;
}

export interface PaymentOrder {
  order_id: string;
  amount: number;
  currency: string;
}

// Razorpay Payment Provider
export class RazorpayPaymentProvider implements PaymentProvider {
  constructor(private keyId: string) {}

  async createOrder(plan: PaymentPlan): Promise<{ order_id: string; amount: number }> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create_payment_order`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan_type: plan }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create payment order');
      }

      return await response.json();
    } catch (error) {
      console.error('Razorpay order creation error:', error);
      throw error;
    }
  }

  async verifyPayment(orderId: string, paymentId: string, signature: string): Promise<boolean> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/verify_payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment verification failed');
      }

      return true;
    } catch (error) {
      console.error('Payment verification error:', error);
      throw error;
    }
  }
}

// Mock Payment Provider for development
export class MockPaymentProvider implements PaymentProvider {
  async createOrder(plan: PaymentPlan): Promise<{ order_id: string; amount: number }> {
    const amounts = {
      weekly: 3900,
      monthly: 12900,
    };

    return {
      order_id: `mock_order_${Date.now()}`,
      amount: amounts[plan],
    };
  }

  async verifyPayment(): Promise<boolean> {
    // In mock mode, always succeed
    return true;
  }
}

// Factory to get payment provider
export function getPaymentProvider(): PaymentProvider {
  const razorpayKey = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

  if (razorpayKey) {
    return new RazorpayPaymentProvider(razorpayKey);
  }

  // Default to mock provider for development
  console.warn(
    'Razorpay key not configured, using mock payment provider. This will not process real payments.'
  );
  return new MockPaymentProvider();
}

// Pricing constants
export const PRICES = {
  weekly: {
    amount: 3900, // ₹39 in paise
    currency: 'INR',
    label: '₹39/week',
    period: 7,
  },
  monthly: {
    amount: 12900, // ₹129 in paise
    currency: 'INR',
    label: '₹129/month',
    period: 30,
  },
};
