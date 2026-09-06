import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/PageHeader';
import { SupportClient } from '@/components/support/SupportClient';
import { getServerLocaleFromRequest } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function DriverSupportPage({ searchParams }: { searchParams: Promise<{ order?: string; new?: string }> }) {
  await requireRole('driver');
  const locale = await getServerLocaleFromRequest();
  const params = await searchParams;
  const orderId = typeof params.order === 'string' ? params.order.slice(0, 80) : '';
  return (
    <>
      <PageHeader title={locale === 'ar' ? 'الدعم' : locale === 'en' ? 'Support' : 'Hilfe & Support'} back backHref="/driver/settings" />
      <SupportClient userRole="driver" initialOrderId={orderId} startNew={params.new === '1' || Boolean(orderId)} showTitle={false} />
    </>
  );
}
