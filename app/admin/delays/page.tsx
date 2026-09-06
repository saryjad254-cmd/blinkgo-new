import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { AdminDelaysClient } from '@/components/admin/AdminDelaysClient';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function AdminDelaysPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const user = await requireRole(['admin', 'super_admin', 'manager']);
  const supabase = await createServerClient();
  const { data: profile } = await supabase.from('users').select('name, email, role').eq('id', user.id).maybeSingle();
  const cookieHeader = (await cookies()).getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const requestedLocale = (await searchParams).lang;
  const locale = requestedLocale === 'ar' || requestedLocale === 'en' || requestedLocale === 'de'
    ? requestedLocale
    : getServerLocale(cookieHeader);
  return <AdminDelaysClient locale={locale} user={{ id: user.id, name: profile?.name ?? user.email?.split('@')[0] ?? 'Admin', email: profile?.email ?? user.email ?? '', role: (profile?.role as 'admin' | 'super_admin' | 'manager') ?? 'manager' }} />;
}
