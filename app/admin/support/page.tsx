import { requireRole } from '@/lib/rbac';
import { AdminLayout } from '@/components/AdminLayout';
import { createServerClient } from '@/lib/supabase/server';
import { TicketList } from '@/components/support/TicketList';

export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  const adminUser = await requireRole('admin');
  const supabase = createServerClient();
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('*, users!support_tickets_user_id_fkey(name, email, role)')
    .order('updated_at', { ascending: false });

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
      <TicketList initialTickets={tickets ?? []} />
    </AdminLayout>
  );
}
