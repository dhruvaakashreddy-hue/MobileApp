import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.5';
import { createHmac } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  const message = `${orderId}|${paymentId}`;
  const expectedSignature = new TextEncoder().encode(message);
  const key = new TextEncoder().encode(secret);

  // Create HMAC SHA256
  const hmac = createHmac('sha256', key);
  hmac.update(expectedSignature);
  const generatedSignature = hmac.toString('hex');

  return generatedSignature === signature;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get user from token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body: VerifyPaymentRequest = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // Verify Razorpay signature
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const isValid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      webhookSecret
    );

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get payment transaction
    const { data: transaction, error: txError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider_order_id', razorpay_order_id)
      .single();

    if (txError || !transaction) {
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Update transaction status
    await supabase
      .from('payment_transactions')
      .update({
        status: 'success',
        provider_payment_id: razorpay_payment_id,
        provider_signature_reference: razorpay_signature,
        verified_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // Update subscription
    const now = new Date();
    const period_end = new Date();

    if (transaction.plan_type === 'weekly') {
      period_end.setDate(period_end.getDate() + 7);
    } else {
      period_end.setMonth(period_end.getMonth() + 1);
    }

    await supabase
      .from('subscriptions')
      .update({
        plan_type: transaction.plan_type,
        provider: 'razorpay',
        provider_subscription_id: razorpay_order_id,
        status: 'active',
        started_at: now.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: period_end.toISOString(),
        trial_status: 'converted', // Convert from trial to paid
      })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Payment verification failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
