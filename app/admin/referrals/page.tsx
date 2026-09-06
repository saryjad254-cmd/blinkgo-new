import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { cookies } from 'next/headers';
import { AdminReferralsClient } from '@/components/admin/AdminReferralsClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminReferralsPage() {
  const user = await requireRole('admin');
  const supabase = createServiceClient();
  const [{ data: profile }, { data: referralRows }] = await Promise.all([
    supabase.from('users').select('name, email, role').eq('id', user.id).single(),
    supabase.from('referrals').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const referrerIds = [...new Set((referralRows ?? []).map((referral) => referral.referrer_id))];
  const { data: referrers } = referrerIds.length
    ? await supabase.from('users').select('id,name,email').in('id', referrerIds)
    : { data: [] };
  const referrersById = new Map((referrers ?? []).map((referrer) => [referrer.id, referrer]));
  const referrals = (referralRows ?? []).map((referral) => ({
    ...referral,
    users: referrersById.get(referral.referrer_id) ?? null,
  }));
  const totalReferrals = referrals?.length ?? 0;
  const completed = referrals?.filter((r) => r.status === 'completed' || r.status === 'rewarded').length ?? 0;
  const pending = referrals?.filter((r) => r.status === 'pending' || r.status === 'signed_up').length ?? 0;
  const conversionRate = totalReferrals > 0 ? (completed / totalReferrals) * 100 : 0;
  const totalRewards = referrals?.filter((r) => r.status === 'rewarded' || r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.reward_value ?? 0), 0) ?? 0;
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
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
