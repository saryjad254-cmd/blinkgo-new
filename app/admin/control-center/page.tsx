import { requireRole } from '@/lib/rbac';
import ControlCenterV3 from '@/components/admin/ControlCenterV3';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Control Center | BlinkGo Admin',
  description: 'Secure entry point for the BlinkGo administration tools',
};

export default async function ControlCenterPage() {
  const user = await requireRole(['admin', 'super_admin', 'manager']);
  return <ControlCenterV3 userName={user.name || user.email || 'Admin'} canViewPaymentOperations={user.role === 'super_admin' || user.permissions.includes('payment_support')} />;
}
