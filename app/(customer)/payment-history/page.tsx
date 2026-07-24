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
  const { data: refunds } = await supabase
    .from('refunds')
    .select('*, orders(order_number)')
    .order('created_at', { ascending: false })
    .limit(50);
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
