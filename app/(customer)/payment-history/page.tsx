import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { cookies } from 'next/headers';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';
import { PaymentHistoryClient } from '@/components/customer/PaymentHistoryClient';
import { CustomerNav } from '@/components/customer/CustomerNav';

export const dynamic = 'force-dynamic';

export default async function PaymentHistoryPage() {
  const user = await requireRole('customer');
  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
  const { data: payments } = await supabase
    .from('payments')
    .select('*, orders(order_number, total, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  // v84: refund REQUEST workflow now lives in the `payments` table
  // (status='refund_requested'). The legacy `refunds` table from
  // migration-22 was never deployed to production. Wrap in try/catch
  // and fall back to the new path so the page never crashes.
  let refunds: any[] = [];
  try {
    const { data: refundRows } = await supabase
      .from('refunds')
      .select('*, orders(order_number)')
      .order('created_at', { ascending: false })
      .limit(50);
    refunds = (refundRows ?? []) as any[];
  } catch {
    // refunds table not in production — read from payments
    const { data: refundRows } = await supabase
      .from('payments')
      .select('id, order_id, amount_cents, currency, status, metadata, created_at, orders(order_number)')
      .in('status', ['refund_requested', 'refund_processing', 'refund_succeeded', 'refund_failed'])
      .order('created_at', { ascending: false })
      .limit(50);
    refunds = (refundRows ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      amount: (r.amount_cents ?? 0) / 100,
      currency: r.currency ?? 'EUR',
      status: r.status,
      reason: r.metadata?.refund_reason ?? null,
      created_at: r.created_at,
      orders: r.orders,
    }));
  }
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
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
