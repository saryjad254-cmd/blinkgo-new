import { requireRole } from '@/lib/rbac';
import { PageHeader } from '@/components/shared/PageHeader';
import { SupportClient } from '@/components/support/SupportClient';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string; new?: string }> }) {
  await requireRole('customer');
  const { locale } = await getServerTranslations();
  const params = await searchParams;
  const title = locale === 'ar' ? 'الدعم' : locale === 'en' ? 'Support' : 'Support';
  const subtitle = locale === 'ar' ? 'طلباتك ومحادثاتك مع فريق BlinkGo' : locale === 'en' ? 'Your requests and conversations with the BlinkGo team' : 'Deine Anfragen und Gespräche mit dem BlinkGo-Team';
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} back backHref={params.order ? `/orders/${encodeURIComponent(params.order)}` : '/help'} />
      <SupportClient userRole="customer" initialOrderId={params.order ?? ''} startNew={params.new === '1'} showTitle={false} />
    </>
  );
}
