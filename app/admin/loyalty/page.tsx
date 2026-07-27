import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdminLoyaltyClient } from '@/components/admin/AdminLoyaltyClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminLoyaltyPage() {
  const user = await requireRole('admin');
  const supabase = createServerClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).single();
  const { data: balances } = await supabase
    .from('loyalty_points')
    .select('*, users!loyalty_points_user_id_fkey(name, email)')
    .order('total_earned', { ascending: false })
    .limit(200);
  const { data: txs } = await supabase
    .from('loyalty_transactions')
    .select('*, users!loyalty_transactions_user_id_fkey(name, email)')
    .order('created_at', { ascending: false })
    .limit(50);
  const totalPoints = balances?.reduce((s, b) => s + b.balance, 0) ?? 0;
  const totalEarned = balances?.reduce((s, b) => s + b.total_earned, 0) ?? 0;
  const totalRedeemed = balances?.reduce((s, b) => s + b.total_redeemed, 0) ?? 0;
  const tierBreakdown = {
    bronze: balances?.filter((b) => b.tier === 'bronze').length ?? 0,
    silver: balances?.filter((b) => b.tier === 'silver').length ?? 0,
    gold: balances?.filter((b) => b.tier === 'gold').length ?? 0,
    platinum: balances?.filter((b) => b.tier === 'platinum').length ?? 0,
  };
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  return (
    <AdminLoyaltyClient
      balances={balances ?? []}
      transactions={txs ?? []}
      stats={{ totalPoints, totalEarned, totalRedeemed, tierBreakdown }}
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
