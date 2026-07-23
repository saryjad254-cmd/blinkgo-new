import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import nextDynamic from 'next/dynamic';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

// Lazy-load map (Google Maps bundle is heavy)
const AdminMapClient = nextDynamic(
  () => import('./AdminMapClient').then((m) => m.AdminMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg">
        <div className="text-text-muted text-sm">Loading map…</div>
      </div>
    ),
  },
);

export const dynamic = 'force-dynamic';

export default async function AdminMapPage() {
  const user = await requireRole('admin');
  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from('users')
    .select('name, email, role')
    .eq('id', user.id)
    .single();

  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  return (
    <AdminMapClient
      user={{
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
