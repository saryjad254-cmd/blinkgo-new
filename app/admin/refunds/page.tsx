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
  const { data: refunds } = await supabase
    .from('refunds')
    .select('*, orders(order_number, total, customer_id, users!orders_customer_id_fkey(name, email))')
    .order('created_at', { ascending: false });
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
