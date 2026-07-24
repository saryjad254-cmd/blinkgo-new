import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { ExpansionDashboard } from '@/components/admin/ExpansionDashboard';

export const dynamic = 'force-dynamic';

export default async function ExpansionPage() {
  await requireRole('admin');
  const supabase = createServerClient();

  const { data: requests, error } = await supabase
    .from('expansion_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  return (
    <ExpansionDashboard
      requests={(requests || []) as any[]}
      loadError={error?.message || null}
    />
  );
}
