import { requireRole } from '@/lib/rbac';
import { AddressesClient } from '@/components/customer/AddressesClient';

export const dynamic = 'force-dynamic';

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireRole('customer');
  const query = await searchParams;
  return <AddressesClient startNew={query.new === '1'} />;
}
