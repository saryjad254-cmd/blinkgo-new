/**
 * Admin Users — list of customers (and any user)
 */
import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminUsersClient } from '@/components/admin/AdminUsersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  phone: string | null;
}

interface UserStats { total: number; active: number; verified: number; byRole: Record<string, number> }

async function loadUsers() {
  const supabase = createServiceClient();
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, role, is_active, is_verified, created_at, last_login_at, phone')
    .order('created_at', { ascending: false })
    .limit(500);

  // Stats
  const stats = ((users || []) as UserRow[]).reduce<UserStats>(
    (acc, u) => {
      acc.total++;
      if (u.role) acc.byRole[u.role] = (acc.byRole[u.role] || 0) + 1;
      if (u.is_active) acc.active++;
      if (u.is_verified) acc.verified++;
      return acc;
    },
    { total: 0, active: 0, verified: 0, byRole: {} as Record<string, number> },
  );

  return {
    users: ((users || []) as UserRow[]).map((entry) => ({ ...entry, last_sign_in_at: entry.last_login_at })),
    stats,
  };
}

export default async function AdminUsersPage() {
  const user = await requireRole('admin');
  const data = await loadUsers();
  return <AdminUsersClient initialUsers={data.users} stats={data.stats} userName={user.name || user.email || 'Admin'} currentUserId={user.id} currentUserRole={user.role} />;
}
