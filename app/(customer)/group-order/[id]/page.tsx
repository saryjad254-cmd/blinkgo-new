import { GroupOrderClient } from '@/components/customer/GroupOrderClient';

export default async function GroupOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupOrderClient groupId={id} />;
}
