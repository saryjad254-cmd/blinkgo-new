import { requireRole } from '@/lib/rbac';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { loadRetailCatalog } from '@/lib/customer/retail-catalog';
import { PageHeader } from '@/components/shared/PageHeader';
import { CustomerMarketplaceNav } from '@/components/customer/CustomerMarketplaceNav';
import { RetailCatalogClient } from '@/components/customer/RetailCatalogClient';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ShopPage() {
  await requireRole(['customer', 'admin', 'super_admin', 'manager']);
  const { locale } = await getServerTranslations();
  const { products, failed } = await loadRetailCatalog('shop');
  const copy = locale === 'ar'
    ? { title: 'BlinkGo تسوّق', subtitle: 'منتجات مختارة من بائعين محليين مع أسعار واضحة وتوصيل متتبّع', failed: 'تعذر تحميل المنتجات', failedBody: 'تحقق من الاتصال ثم حاول مجددًا.', empty: 'لم تُنشر منتجات تسوّق بعد', emptyBody: 'لن نعرض منتجات وهمية. تظهر المنتجات هنا بعد اعتماد البائع والمخزون والسعر من الإدارة.' }
    : locale === 'en'
      ? { title: 'BlinkGo Shop', subtitle: 'Curated products from local sellers with clear pricing and tracked delivery', failed: 'Products could not be loaded', failedBody: 'Check your connection and try again.', empty: 'No shop products have been published yet', emptyBody: 'We do not show fake inventory. Products appear after the seller, stock and price are approved.' }
      : { title: 'BlinkGo Shop', subtitle: 'Ausgewählte Produkte lokaler Händler mit klaren Preisen und verfolgter Lieferung', failed: 'Produkte konnten nicht geladen werden', failedBody: 'Prüfe deine Verbindung und versuche es erneut.', empty: 'Noch keine Shop-Produkte veröffentlicht', emptyBody: 'Wir zeigen keine erfundenen Bestände. Produkte erscheinen nach Händler-, Bestands- und Preisfreigabe.' };

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} back backHref="/home" />
      <CustomerMarketplaceNav className="mx-auto mt-4 max-w-4xl" />
      {failed ? (
        <div className="mx-auto max-w-7xl px-4 py-8"><EmptyState iconName="AlertCircle" title={copy.failed} description={copy.failedBody} action={{ label: copy.title, href: '/shop' }} /></div>
      ) : products.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 py-8"><EmptyState iconName="PackageSearch" title={copy.empty} description={copy.emptyBody} /></div>
      ) : <RetailCatalogClient products={products} />}
    </>
  );
}
