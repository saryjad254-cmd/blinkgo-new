import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdminRefundsClient } from '@/components/admin/AdminRefundsClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminRefundsPage() {
  const user = await requireRole('admin');
  const supabase = createServerClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
  // v84: refund REQUEST workflow now lives in the `payments` table
  // (status='refund_requested'). The legacy `refunds` table from
  // migration-22 was never deployed to production. Wrap in try/catch
  // and fall back to the new path so the admin page never crashes.
  let refunds: any[] = [];
  try {
    const { data: refundRows } = await supabase
      .from('refunds')
      .select('*, orders(order_number, total, customer_id, users!orders_customer_id_fkey(name, email))')
      .order('created_at', { ascending: false });
    refunds = (refundRows ?? []) as any[];
  } catch {
    const { data: refundRows } = await supabase
      .from('payments')
      .select('id, order_id, amount_cents, currency, status, metadata, created_at, orders(order_number, total, customer_id, users!orders_customer_id_fkey(name, email))')
      .in('status', ['refund_requested', 'refund_processing', 'refund_succeeded', 'refund_failed'])
      .order('created_at', { ascending: false });
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
    <AdminRefundsClient
      refunds={refunds ?? []}
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
