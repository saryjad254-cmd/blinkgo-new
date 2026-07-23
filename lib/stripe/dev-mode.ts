/**
 * Stripe Dev Payment Mode
 * ───────────────────────
 * Use ONLY for local development and demos when no real Stripe keys
 * are available. Simulates a successful payment by writing a row to
 * the `payments` table and marking the order as paid + confirmed.
 *
 * Safety:
 *   - Refuses to run when NODE_ENV === 'production' (throws)
 *   - Must be explicitly enabled with ENABLE_DEV_PAYMENT=true
 *   - Marks every payment with `method = 'mock'` and a `mock_*` provider_payment_id
 *     so audit queries can isolate simulated payments from real ones.
 *
 * Enable via `.env.local`:
 *   ENABLE_DEV_PAYMENT=true
 */
import { createClient } from '@supabase/supabase-js';

export function isDevPaymentEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ENABLE_DEV_PAYMENT === 'true';
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface DevPaymentResult {
  ok: true;
  mock: true;
  payment_id: string;
  payment_status: 'succeeded';
  order_status: 'confirmed';
}

/**
 * Simulates a successful Stripe payment for the given order.
 * - Inserts a `payments` row with status='succeeded'
 * - Updates `orders.payment_status='paid'` and `status='confirmed'`
 *
 * @throws if Stripe is configured (production path), the order doesn't belong
 *         to the user, or the DB write fails.
 */
export async function simulateDevPayment(args: {
  orderId: string;
  customerId: string;
}): Promise<DevPaymentResult> {
  if (!isDevPaymentEnabled()) {
    throw new Error('Dev payment is not enabled. Set ENABLE_DEV_PAYMENT=true.');
  }
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME') {
    throw new Error(
      'Real Stripe is configured — dev payment is disabled. Unset STRIPE_SECRET_KEY to use dev mode.'
    );
  }

  const supabase = getServiceClient();

  // 1. Load the order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_id, total, status, payment_status')
    .eq('id', args.orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(`Order not found: ${orderErr?.message ?? ''}`);
  }
  if (order.customer_id !== args.customerId) {
    throw new Error('Not your order');
  }
  if (order.payment_status === 'paid') {
    throw new Error('Order already paid');
  }

  // 2. Insert simulated payment row
  const mockPaymentId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      amount_cents: Math.round(Number(order.total) * 100),
      currency: 'EUR',
      payment_method: 'mock',
      payment_provider: 'mock',
      provider_payment_id: mockPaymentId,
      status: 'succeeded',
      metadata: {
        source: 'dev-mode',
        warning: 'NOT a real Stripe payment',
        generated_by: 'simulateDevPayment',
        customer_id: order.customer_id,
        paid_at_iso: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (payErr || !payment) {
    throw new Error(`Failed to insert payment: ${payErr?.message ?? ''}`);
  }

  // 3. Update order status
  const { error: updErr } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
      stripe_payment_intent_id: mockPaymentId,
    })
    .eq('id', order.id);

  if (updErr) {
    throw new Error(`Failed to update order: ${updErr.message}`);
  }

  return {
    ok: true,
    mock: true,
    payment_id: payment.id,
    payment_status: 'succeeded',
    order_status: 'confirmed',
  };
}
