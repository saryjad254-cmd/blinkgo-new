import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminRefundsClient } from '@/components/admin/AdminRefundsClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function AdminRefundsPage() {
  const user = await requireRole('admin');
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  const canViewPayments = user.role === 'super_admin' || user.permissions.includes('payment_support');
  if (!canViewPayments) {
    const copy = {
      de: { title: 'Zusätzliche Berechtigung erforderlich', body: 'Rückerstattungen enthalten besonders geschützte Zahlungsdaten. Bitte wende dich an einen Super-Admin, um die Berechtigung „payment_support“ zu erhalten.' },
      ar: { title: 'مطلوب تصريح إضافي', body: 'تحتوي عمليات الاسترداد على بيانات دفع شديدة الحساسية. اطلب من مدير أعلى منحك صلاحية payment_support.' },
      en: { title: 'Additional permission required', body: 'Refunds contain highly sensitive payment data. Ask a super admin to grant the payment_support permission.' },
    }[locale];
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div role="alert" className="rounded-3xl border border-brand-yellow/30 bg-brand-yellow/10 p-6">
          <h1 className="text-xl font-black text-white">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{copy.body}</p>
        </div>
      </main>
    );
  }
  // Phase 7G-D: refunds now live in payment_refunds (one row per refund op)
  // Use the service client to read the table (RLS blocks anon/authenticated).
  const svc = createServiceClient();
  const { data: refundRows } = await svc
    .from('payment_refunds')
    .select(`
      id, stripe_refund_id, status, requested_amount_cents, refunded_amount_cents,
      currency, reason, requested_by, order_id, customer_id,
      created_at, updated_at, completed_at, failure_reason
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  // Look up order details
  const orderIds = Array.from(new Set((refundRows ?? []).map((r: { order_id: string }) => r.order_id).filter(Boolean)));
  const { data: orders } = orderIds.length > 0
    ? await svc.from('orders').select('id, order_number, total, customer_id').in('id', orderIds)
    : { data: [] as Array<{ id: string; order_number: string; total: number; customer_id: string }> };
  const orderMap = new Map((orders ?? []).map((o: { id: string }) => [o.id, o]));

  // Look up customer names
  const customerIds = Array.from(new Set((orders ?? []).map((o: { customer_id: string }) => o.customer_id).filter(Boolean)));
  const { data: users } = customerIds.length > 0
    ? await svc.from('users').select('id, name, email').in('id', customerIds)
    : { data: [] as Array<{ id: string; name: string; email: string }> };
  const userMap = new Map((users ?? []).map((u: { id: string; name: string; email: string }) => [u.id, u]));

  const refunds = (refundRows ?? []).map((r: Record<string, unknown>) => {
    const order = orderMap.get(r.order_id as string) as { order_number: string; total: number; customer_id: string } | undefined;
    const customer = order ? userMap.get(order.customer_id) : undefined;
    return {
      id: r.id as string,
      stripe_refund_id: (r.stripe_refund_id as string | null) ?? null,
      order_id: r.order_id as string,
      amount: (Number(r.requested_amount_cents ?? 0)) / 100,
      refunded_amount: (Number(r.refunded_amount_cents ?? 0)) / 100,
      currency: r.currency as string,
      status: r.status as 'requested' | 'validating' | 'submitted' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_review',
      reason: r.reason as string,
      failure_reason: (r.failure_reason as string | null) ?? null,
      requested_by: r.requested_by as string,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      completed_at: (r.completed_at as string | null) ?? null,
      orders: order
        ? {
            order_number: order.order_number,
            total: order.total,
            customer_id: order.customer_id,
            users: customer ? { name: customer.name, email: customer.email } : null,
          }
        : null,
    };
  });

  const { data: profile } = await svc.from('users').select('name, email, role').eq('id', user.id).single();

  return (
    <AdminRefundsClient
      refunds={refunds}
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
