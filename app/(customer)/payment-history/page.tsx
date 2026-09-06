import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { cookies } from 'next/headers';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';
import { PaymentHistoryClient } from '@/components/customer/PaymentHistoryClient';
import { CustomerNav } from '@/components/customer/CustomerNav';

export const dynamic = 'force-dynamic';

interface RefundRow {
  id: string;
  order_id: string;
  requested_amount_cents: number | null;
  refunded_amount_cents: number | null;
  currency: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  orders: { order_number: string } | Array<{ order_number: string }> | null;
}

export default async function PaymentHistoryPage() {
  const user = await requireRole('customer');
  const supabase = createServiceClient();
  const { data: payments } = await supabase
    .from('payments')
    .select('id, order_id, amount, currency, method, status, paid_at, failed_reason, metadata, created_at, orders(order_number, total, status)')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  // Refund operations are stored separately from charge payments. Keeping
  // them separate prevents refund requests from being counted as payments.
  const { data: refundRows } = await supabase
    .from('payment_refunds')
    .select('id, order_id, requested_amount_cents, refunded_amount_cents, currency, status, reason, created_at, orders(order_number)')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const refunds = (refundRows as RefundRow[] | null ?? []).map((r) => ({
    id: r.id,
    order_id: r.order_id,
    amount: (r.requested_amount_cents ?? 0) / 100,
    refunded_amount: (r.refunded_amount_cents ?? 0) / 100,
    currency: r.currency ?? 'EUR',
    status: r.status,
    reason: r.reason ?? null,
    created_at: r.created_at,
    orders: r.orders,
  }));
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <CustomerNav />
      <PaymentHistoryClient
        payments={payments ?? []}
        refunds={refunds ?? []}
        locale={locale}
      />
    </div>
  );
}
