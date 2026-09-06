import { cookies } from 'next/headers';
import { AdminFeatureFlagsClient } from '@/components/admin/AdminFeatureFlagsClient';
import { getServerLocale, type Locale } from '@/lib/i18n/server-translations';
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { getFeatureFlagSnapshot } from '@/lib/platform/feature-flags';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feature-Steuerung | BlinkGo Admin',
  description: 'Feature Flags, Rollouts und operative Kill Switches sicher verwalten',
};

export default async function AdminFeatureFlagsPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin']);
  const service = createServiceClient();
  const [{ data: profile }, snapshot] = await Promise.all([
    service.from('users').select('name,email,role').eq('id', user.id).maybeSingle(),
    getFeatureFlagSnapshot(),
  ]);
  const cookieHeader = (await cookies()).getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  return (
    <AdminFeatureFlagsClient
      initialFlags={snapshot.flags}
      degraded={snapshot.degraded}
      locale={locale}
      user={{
        id: user.id,
        name: profile?.name ?? 'Admin',
        email: profile?.email ?? user.email ?? '',
        role: (profile?.role as 'manager' | 'admin' | 'super_admin') ?? 'manager',
      }}
    />
  );
}
