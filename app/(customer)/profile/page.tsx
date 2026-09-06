import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { AccountDashboard } from '@/components/account/AccountDashboard';

export const dynamic = 'force-dynamic';

interface RecentOrderRow {
  id: string;
  order_number: string | null;
  total: number | string | null;
  status: string;
  created_at: string;
}

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number | string;
  valid_until: string;
  min_order_amount: number | string | null;
}

interface AddressRow {
  id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  details: unknown;
  is_default: boolean;
}

interface PaymentMethodRow {
  id: string;
  type: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

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
  const supabase = await createServerClient();

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
    .select('balance, total_earned, tier')
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
    .select('id, code, description, discount_type, discount_value, valid_until, min_order_amount')
    .eq('is_active', true)
    .gte('valid_until', new Date().toISOString())
    .limit(10);

  // 6) Addresses
  const { data: addresses } = await supabase
    .from('customer_addresses')
    .select('id, label, address, latitude, longitude, details, is_default')
    .eq('customer_id', user.id)
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
        recentOrders: ((recentOrders ?? []) as RecentOrderRow[]).map((order) => ({
          ...order,
          total: Number(order.total || 0),
        })),
        loyalty: loyalty
          ? { points: loyalty.balance ?? 0, lifetime_points: loyalty.total_earned ?? 0, tier: loyalty.tier }
          : { points: 0, lifetime_points: 0, tier: 'bronze' },
        wallet: wallet
          ? { balance: Number(wallet.balance || 0), currency: wallet.currency || 'EUR' }
          : { balance: 0, currency: 'EUR' },
      }}
      coupons={((activeCoupons ?? []) as CouponRow[]).map((coupon) => ({ ...coupon, expires_at: coupon.valid_until }))}
      addresses={((addresses ?? []) as AddressRow[]).map((address) => ({
        ...address,
        postal_code: typeof address.address === 'string' ? address.address.match(/\b\d{5}\b/)?.[0] ?? null : null,
      }))}
      paymentMethods={(paymentMethods ?? []) as PaymentMethodRow[]}
    />
  );
}
