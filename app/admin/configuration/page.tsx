import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { cookies } from 'next/headers';
import { AdminConfigClient } from '@/components/admin/AdminConfigClient';
import { getServerLocale } from '@/lib/i18n/server-translations';
import type { Locale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const user = await requireRole('admin');
  const supabase = createServiceClient();
  const { data: config } = await supabase.from('config').select('*').order('key');
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);
  return (
    <AdminConfigClient
      initialConfig={config ?? []}
      user={{
        name: user.name ?? 'Admin',
        email: user.email ?? '',
        role: (user.role as 'super_admin' | 'admin' | 'manager') ?? 'admin',
      }}
      locale={locale}
    />
  );
}
