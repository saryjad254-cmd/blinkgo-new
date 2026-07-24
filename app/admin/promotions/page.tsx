import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { AdminPromotionsClient } from '@/components/admin/AdminPromotionsClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminPromotionsPage() {
  const user = await requireRole('admin');
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('users')
    .select('name, email, role')
    .eq('id', user.id)
    .single();
  const { data: promotions } = await supabase
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('is_active', true);
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  return (
    <AdminPromotionsClient
      initialPromotions={promotions ?? []}
      restaurants={restaurants ?? []}
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
