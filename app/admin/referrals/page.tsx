import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdminReferralsClient } from '@/components/admin/AdminReferralsClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminReferralsPage() {
  const user = await requireRole('admin');
  const supabase = createServerClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
  const { data: referrals } = await supabase
    .from('referrals')
    .select('*, users!referrals_referrer_id_fkey(name, email)')
    .order('created_at', { ascending: false })
    .limit(200);
  const totalReferrals = referrals?.length ?? 0;
  const completed = referrals?.filter((r) => r.status === 'completed' || r.status === 'rewarded').length ?? 0;
  const pending = referrals?.filter((r) => r.status === 'pending' || r.status === 'signed_up').length ?? 0;
  const conversionRate = totalReferrals > 0 ? (completed / totalReferrals) * 100 : 0;
  const totalRewards = referrals?.filter((r) => r.status === 'rewarded' || r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.reward_credit ?? 0), 0) ?? 0;
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  return (
    <AdminReferralsClient
      referrals={referrals ?? []}
      stats={{ totalReferrals, completed, pending, conversionRate, totalRewards }}
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
