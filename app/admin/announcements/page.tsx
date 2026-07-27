import { requireRole } from '@/lib/rbac';
import { AdminLayout } from '@/components/AdminLayout';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const adminUser = await requireRole('admin');
  const supabase = createServerClient();
  const { data: announcements } = await supabase
    .from('system_announcements')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <AdminLayout
      user={{
        id: adminUser.id,
        name: adminUser.name ?? 'Admin',
        email: adminUser.email ?? '',
        role: adminUser.role,
        isActive: adminUser.isActive,
        isVerified: adminUser.isVerified,
      }}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-text">System Announcements</h1>
          <p className="text-sm text-text-muted mt-1">Post platform-wide announcements to users</p>
        </div>

        <div className="rounded-2xl bg-bg-elevated border border-edge p-4">
          <p className="text-sm text-text-muted">
            {announcements?.length ?? 0} total announcements
          </p>
          {announcements && announcements.length > 0 && (
            <ul className="mt-4 space-y-2">
              {announcements.slice(0, 10).map((a: any) => (
                <li key={a.id} className="p-3 rounded-xl bg-surface text-sm">
                  <div className="font-bold text-text">{a.title}</div>
                  <div className="text-text-muted text-xs mt-1">{a.message}</div>
                  <div className="text-2xs text-text-muted mt-1">
                    {a.type} · {a.audience} · {a.is_active ? 'Active' : 'Inactive'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
