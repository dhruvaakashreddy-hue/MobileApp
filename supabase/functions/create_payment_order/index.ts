import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateOrderRequest {
  plan_type: 'weekly' | 'monthly';
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

    const body: CreateOrderRequest = await req.json();
    const { plan_type } = body;

    if (!['weekly', 'monthly'].includes(plan_type)) {
      return new Response(JSON.stringify({ error: 'Invalid plan type' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Determine amount based on plan (in paise)
    const amounts = {
      weekly: 3900, // ₹39
      monthly: 12900, // ₹129
    };

    const amount = amounts[plan_type as keyof typeof amounts];

    // Create Razorpay order
    const razorpayKey = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpaySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKey || !razorpaySecret) {
      throw new Error('Razorpay credentials not configured');
    }

    const auth = btoa(`${razorpayKey}:${razorpaySecret}`);

    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `crush_${user.id}_${Date.now()}`,
      }),
    });

    if (!orderResponse.ok) {
      throw new Error(`Razorpay API error: ${orderResponse.statusText}`);
    }

    const orderData = await orderResponse.json();

    // Store transaction record
    await supabase.from('payment_transactions').insert({
      user_id: user.id,
      provider: 'razorpay',
      provider_order_id: orderData.id,
      plan_type,
      amount,
      currency: 'INR',
      status: 'pending',
    });

    return new Response(
      JSON.stringify({
        order_id: orderData.id,
        amount,
        currency: 'INR',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Payment order creation error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Payment order creation failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
