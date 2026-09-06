import { cookies } from 'next/headers';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { getServerLocale, type Locale } from '@/lib/i18n/server-translations';
import { AdminAnnouncementsClient, type Announcement } from './AdminAnnouncementsClient';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const adminUser = await requireRole('admin');
  const supabase = await createServerClient();
  const { data: announcements } = await supabase
    .from('system_announcements')
    .select('*')
    .order('created_at', { ascending: false });
  const cookieHeader = (await cookies()).getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  return <AdminAnnouncementsClient
    locale={locale}
    initialAnnouncements={(announcements ?? []) as Announcement[]}
    user={{
      name: adminUser.name ?? 'Admin',
      email: adminUser.email ?? '',
      role: adminUser.role as 'super_admin' | 'admin' | 'manager',
    }}
  />;
}
