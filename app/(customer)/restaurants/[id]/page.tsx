import { notFound } from 'next/navigation';
import { Star, Clock, Truck, Sparkles, ChefHat, Leaf, MapPin } from 'lucide-react';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { restaurantCoverUrl, productImageUrl } from '@/lib/images';
import { SafeImg } from '@/components/shared/SafeImg';
import { AddToCartButton } from '@/components/customer/AddToCartButton';
import { CarbonCard } from '@/components/customer/CarbonCard';
import { BackButton } from '@/components/shared/BackButton';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import type { Restaurant, Product } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { getServerLocale, getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

async function getRestaurant(id: string): Promise<Restaurant | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return { ...(data as Restaurant), cover_url: restaurantCoverUrl(data as any) };
}

async function getProducts(restaurantId: string): Promise<Product[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .order('is_featured', { ascending: false })
    .order('name', { ascending: true });

  if (error) return [];
  return ((data ?? []) as Product[]).map((p) => ({ ...p, image_urls: productImageUrl(p as any) ? [productImageUrl(p as any) as string] : [] }));
}

export default async function RestaurantPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole('customer');
  const restaurant = await getRestaurant(params.id);
  if (!restaurant) notFound();

  const products = await getProducts(params.id);
  const { locale } = await getServerTranslations();

  // Presentation-only grouping by the products' category field (order within
  // each group preserved exactly as fetched — featured first, then name).
  const UNCATEGORIZED = '__menu__';
  const grouped = new Map<string, Product[]>();
  for (const p of products) {
    const cat = ((p as any).category as string | null)?.trim() || UNCATEGORIZED;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(p);
  }
  const categories = Array.from(grouped.entries());
  const slugify = (s: string) => encodeURIComponent(s.toLowerCase().replace(/\s+/g, '-'));

  // 3-locale strings used on this page (so the AR/EN/DE cookie never leaks the
  // opposite language into a single page).
  const COPY = {
    rating: locale === 'ar' ? 'تقييم' : locale === 'en' ? 'reviews' : 'Bewertungen',
    deliveryTime: locale === 'ar' ? 'وقت التوصيل' : locale === 'en' ? 'Delivery time' : 'Lieferzeit',
    deliveryFee: locale === 'ar' ? 'رسوم التوصيل' : locale === 'en' ? 'Delivery fee' : 'Liefergebühr',
    menu: locale === 'ar' ? 'القائمة' : locale === 'en' ? 'Menu' : 'Speisekarte',
    noProductsTitle: locale === 'ar' ? 'لا توجد منتجات متاحة' : locale === 'en' ? 'No products available' : 'Keine Produkte verfügbar',
    noProductsDesc: locale === 'ar' ? 'تحقق لاحقًا أو جرب مطعمًا آخر' : locale === 'en' ? 'Check back later or try another restaurant' : 'Schau später wieder vorbei oder probiere ein anderes Restaurant',
    featured: locale === 'ar' ? 'مميز' : locale === 'en' ? 'Featured' : 'Empfohlen',
  } as const;

  return (
    <>
      {/* Hero — full-bleed cover with floating back button (no duplicate header band) */}
      <div className="relative h-56 sm:h-72 md:h-80 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {restaurant.cover_url ? (
          <SafeImg
            src={restaurant.cover_url}
            alt={restaurant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-red-500/20 to-danger/10" />
            <ChefHat className="w-20 h-20 text-brand-red-500/30 relative" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        {/* Floating back — RTL-safe (start-aligned) */}
        <div className="absolute top-4 start-4 z-10">
          <BackButton fallback="/restaurants" className="bg-bg/70 backdrop-blur-md border border-edge-light shadow-speed-sm" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative">
        {/* Restaurant info card — glass style */}
        <div className="card glass-card backdrop-blur-xl p-5 sm:p-6 mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
                {restaurant.name}
              </h1>
              {restaurant.description && (
                <p className="text-sm text-text-secondary leading-relaxed">
                  {restaurant.description}
                </p>
              )}
              {restaurant.address && (
                <p className="flex items-center gap-1.5 text-xs text-text-muted mt-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{restaurant.address}</span>
                </p>
              )}
            </div>
            {restaurant.is_featured && (
              <span className="badge badge-primary flex-shrink-0">
                <Sparkles className="w-3 h-3" />
                {COPY.featured}
              </span>
            )}
          </div>

          {restaurant.cuisine?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {restaurant.cuisine.map((c) => (
                <span
                  key={c}
                  className="text-xs bg-brand-red-500/15 text-brand-red-500 px-2.5 py-1 rounded-pill font-semibold border border-brand-red-500/30"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center pt-4 border-t border-edge-light">
            <div>
              <div className="flex items-center justify-center gap-1 text-sm font-bold text-white">
                <Star className="w-4 h-4 fill-accent text-accent" />
                {Number(restaurant.rating || 0).toFixed(1)}
              </div>
              <p className="text-xs text-text-muted mt-1">{restaurant.review_count || 0} {COPY.rating}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-sm font-bold text-white">
                <Clock className="w-4 h-4 text-info" />
                {restaurant.estimated_delivery_time}
              </div>
              <p className="text-xs text-text-muted mt-1">{COPY.deliveryTime}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-sm font-bold text-white">
                <Truck className="w-4 h-4 text-success" />
                {formatEUR(restaurant.delivery_fee)}
              </div>
              <p className="text-xs text-text-muted mt-1">{COPY.deliveryFee}</p>
            </div>
          </div>
        </div>

        {/* Menu — grouped by category (Wolt-style) with sticky anchor chips */}
        <div className="pb-24">
          {products.length === 0 ? (
            <>
              <h2 className="text-lg font-bold text-white mb-3 px-1">{COPY.menu}</h2>
              <EmptyState
                iconName="Leaf"
                title={COPY.noProductsTitle}
                description={COPY.noProductsDesc}
              />
            </>
          ) : (
            <>
              {categories.length > 1 && (
                <nav className="sticky top-14 md:top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 mb-4 bg-bg/85 backdrop-blur-xl border-b border-edge-light overflow-x-auto scrollbar-hide">
                  <div className="flex items-center gap-2 w-max">
                    {categories.map(([cat]) => (
                      <a
                        key={cat}
                        href={`#cat-${slugify(cat)}`}
                        className="whitespace-nowrap text-xs font-bold text-text-secondary hover:text-white bg-bg-card border border-edge-light hover:border-brand-red-500/40 px-3 py-1.5 rounded-pill transition-colors"
                      >
                        {cat === UNCATEGORIZED ? COPY.menu : cat}
                      </a>
                    ))}
                  </div>
                </nav>
              )}

              {categories.map(([cat, items]) => (
                <section key={cat} id={`cat-${slugify(cat)}`} className="scroll-mt-28 mb-8 last:mb-0">
                  <h2 className="text-lg font-bold text-white mb-3 px-1">
                    {cat === UNCATEGORIZED ? COPY.menu : cat}
                    <span className="text-xs font-semibold text-text-muted ms-2 align-middle">{items.length}</span>
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {items.map((product, i) => (
                      <div
                        key={product.id}
                        className="animate-slide-up"
                        style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                      >
                        <ProductRow product={product} restaurant={restaurant} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ProductRow({ product, restaurant }: { product: Product; restaurant: Restaurant }) {
  const price = Number(product.discount_price ?? product.price);
  const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);

  return (
    <div className="card glass-card h-full p-3 sm:p-4 flex gap-3 sm:gap-4 hover:border-brand-red-500/40 hover:-translate-y-0.5 transition-all">
      {/* Image */}
      <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-sm overflow-hidden bg-surface relative">
        {product.image_urls?.[0] ? (
          <SafeImg
            src={product.image_urls[0]}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-br from-surface to-bg">
            🍽️
          </div>
        )}
        {product.is_featured && (
          <span className="absolute top-1 end-1 inline-flex items-center bg-speed-gradient text-white text-[9px] px-1.5 py-0.5 rounded-pill font-bold shadow-speed-glow">
            ⭐
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-bold text-white truncate">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-text-muted line-clamp-2 mt-1 leading-relaxed">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-3">
          <div>
            <span className="text-base font-bold text-white">
              {formatEUR(price)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-text-muted line-through ms-2">
                {formatEUR(product.price, false)}
              </span>
            )}
          </div>
          <AddToCartButton product={product} restaurant={restaurant} />
        </div>
      </div>
    </div>
  );
}