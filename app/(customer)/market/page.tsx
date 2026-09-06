import { requireRole } from '@/lib/rbac';
import { getServerTranslations } from '@/lib/i18n/server-translations';
import { loadRetailCatalog } from '@/lib/customer/retail-catalog';
import { PageHeader } from '@/components/shared/PageHeader';
import { CustomerMarketplaceNav } from '@/components/customer/CustomerMarketplaceNav';
import { RestaurantCard } from '@/components/customer/RestaurantCard';
import { RetailCatalogClient } from '@/components/customer/RetailCatalogClient';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MarketPage() {
  await requireRole(['customer', 'admin', 'super_admin', 'manager']);
  const { locale } = await getServerTranslations();
  const { retailers, products, failed } = await loadRetailCatalog('market');
  const copy = locale === 'ar'
    ? { title: 'الماركت', subtitle: 'سوبرماركت، صيدلية واحتياجات يومية من متاجر قريبة', stores: 'متاجر قريبة', essentials: 'احتياجات سريعة', failed: 'تعذر تحميل الماركت', failedBody: 'تحقق من الاتصال ثم حاول مجددًا.', empty: 'لا توجد متاجر ماركت متاحة حاليًا', emptyBody: 'ستظهر المتاجر هنا بعد اعتمادها وفتحها للتوصيل.' }
    : locale === 'en'
      ? { title: 'Market', subtitle: 'Groceries, pharmacy and daily essentials from nearby stores', stores: 'Stores near you', essentials: 'Quick essentials', failed: 'Market could not be loaded', failedBody: 'Check your connection and try again.', empty: 'No market stores are available right now', emptyBody: 'Approved stores will appear here once they open for delivery.' }
      : { title: 'Markt', subtitle: 'Lebensmittel, Apotheke und Alltagseinkäufe aus deiner Nähe', stores: 'Geschäfte in deiner Nähe', essentials: 'Schnell gebraucht', failed: 'Markt konnte nicht geladen werden', failedBody: 'Prüfe deine Verbindung und versuche es erneut.', empty: 'Aktuell sind keine Markt-Partner verfügbar', emptyBody: 'Freigegebene Geschäfte erscheinen hier, sobald sie für Lieferungen öffnen.' };

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} back backHref="/home" />
      <CustomerMarketplaceNav className="mx-auto mt-4 max-w-4xl" />
      {failed ? (
        <div className="mx-auto max-w-7xl px-4 py-8"><EmptyState iconName="AlertCircle" title={copy.failed} description={copy.failedBody} action={{ label: copy.title, href: '/market' }} /></div>
      ) : retailers.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 py-8"><EmptyState iconName="ShoppingBasket" title={copy.empty} description={copy.emptyBody} /></div>
      ) : (
        <>
          <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" aria-labelledby="market-stores-title">
            <h2 id="market-stores-title" className="mb-4 text-xl font-black">{copy.stores}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {retailers.map((retailer, index) => <RestaurantCard key={retailer.id} restaurant={retailer} index={index} />)}
            </div>
          </section>
          {products.length > 0 && <section aria-labelledby="market-products-title"><h2 id="market-products-title" className="mx-auto max-w-7xl px-4 pt-2 text-xl font-black sm:px-6 lg:px-8">{copy.essentials}</h2><RetailCatalogClient products={products.slice(0, 20)} /></section>}
        </>
      )}
    </>
  );
}
