import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { AccountDashboard } from '@/components/account/AccountDashboard';

export const dynamic = 'force-dynamic';

/**
 * Account / profile page — server-side fetch, client-side interactions.
 *
 * The AccountDashboard is the client component that renders all the
 * premium sections: hero header, avatar, profile, stats, loyalty,
 * wallet, coupons, addresses, payment methods, settings.
 *
 * The page is fully defensive: if any of the auxiliary tables (orders,
 * coupons, addresses, payment methods) are missing, the corresponding
 * section shows a graceful empty state instead of an error.
 */
export default async function AccountPage() {
  const user = await requireRole('customer');
  const supabase = createServerClient();

  // 1) Profile
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, phone, role, is_active, is_verified, created_at, last_login_at, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  // 2) Order stats
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', user.id);

  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, order_number, total, status, created_at')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  // 3) Loyalty points
  const { data: loyalty } = await supabase
    .from('loyalty_points')
    .select('points, lifetime_points, tier')
    .eq('user_id', user.id)
    .maybeSingle();

  // 4) Wallet balance
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance, currency')
    .eq('user_id', user.id)
    .maybeSingle();

  // 5) Active coupons
  const { data: activeCoupons } = await supabase
    .from('coupons')
    .select('id, code, description, discount_type, discount_value, expires_at, min_order_amount')
    .eq('is_active', true)
    .gte('expires_at', new Date().toISOString())
    .limit(10);

  // 6) Addresses
  const { data: addresses } = await supabase
    .from('customer_addresses')
    .select('id, label, street, city, postal_code, country, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .limit(10);

  // 7) Payment methods
  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('id, type, last4, brand, exp_month, exp_year, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .limit(10);

  return (
    <AccountDashboard
      user={{ id: user.id, email: user.email || '' }}
      profile={profile || null}
      stats={{
        orderCount: orderCount || 0,
        recentOrders: (recentOrders || []) as any[],
        loyalty: (loyalty as any) || { points: 0, lifetime_points: 0, tier: 'bronze' },
        wallet: (wallet as any) || { balance: 0, currency: 'EUR' },
      }}
      coupons={(activeCoupons || []) as any[]}
      addresses={(addresses || []) as any[]}
      paymentMethods={(paymentMethods || []) as any[]}
    />
  );
}
