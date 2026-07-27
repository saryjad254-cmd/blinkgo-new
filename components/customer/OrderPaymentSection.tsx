'use client';

import { useRouter } from 'next/navigation';
import { StripeCheckout } from './StripeCheckout';

interface Props {
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
}

/**
 * Wraps StripeCheckout with router-refresh logic so the order page
 * re-fetches after a successful payment.
 *
 * Shows the StripeCheckout only when:
 *   - payment_method === 'stripe'
 *   - payment_status !== 'paid'
 *   - (status assumed 'pending' but not enforced here — server-controlled)
 */
export function OrderPaymentSection({ orderId, amount, paymentMethod, paymentStatus }: Props) {
  const router = useRouter();

  if (paymentMethod !== 'stripe') return null;
  if (paymentStatus === 'paid') return null;

  return (
    <StripeCheckout
      orderId={orderId}
      amount={amount}
      onSuccess={() => router.refresh()}
    />
  );
}
