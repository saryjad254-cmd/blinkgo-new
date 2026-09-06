import { cookies } from 'next/headers';
import { requireRole } from '@/lib/rbac';
import IntegrationsConsole from '@/components/admin/IntegrationsConsole';
import { getServerLocale, type Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Integrationen | BlinkGo Admin',
  description: 'Integrationen, Webhooks und Automatisierung verwalten',
};

export default async function IntegrationsPage() {
  const admin = await requireRole('admin');
  const cookieHeader = (await cookies()).getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  return <IntegrationsConsole
    locale={locale}
    user={{
      name: admin.name ?? 'Admin',
      email: admin.email ?? '',
      role: admin.role as 'super_admin' | 'admin' | 'manager',
    }}
  />;
}
