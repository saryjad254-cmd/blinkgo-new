import { notFound } from 'next/navigation';
import Image from 'next/image';
import Star from 'lucide-react/dist/esm/icons/star';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Leaf from 'lucide-react/dist/esm/icons/leaf';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { AddToCartButton } from '@/components/customer/AddToCartButton';
import { CarbonCard } from '@/components/customer/CarbonCard';
import { PageHeader } from '@/components/shared/PageHeader';
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
  return data as Restaurant;
}

async function getProducts(restaurantId: string): Promise<Product[]> {
  const supabase = createServerClient();
  // Defensive: try `is_available` first (the canonical column used
  // by the menu UI), then fall back to `is_active`, then to no
  // filter at all if neither column exists. The customer-facing
  // restaurant page must never be blank because of a missing
  // column.
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Product[];
  } catch (e: any) {
    if (!/column .* does not exist/i.test(e?.message || '')) throw e;
  }
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Product[];
  } catch (e: any) {
    if (!/column .* does not exist/i.test(e?.message || '')) throw e;
  }
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('is_featured', { ascending: false })
    .order('name', { ascending: true });
  return (data ?? []) as Product[];
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
      <PageHeader title={restaurant.name} subtitle={restaurant.address} back />

      {/* Cover with overlay */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-br from-surface to-bg overflow-hidden">
        {restaurant.cover_url ? (
          // PERF: LCP candidate on the restaurant detail page. next/image
          // with priority + fill emits a high-priority <link rel=preload>,
          // serves AVIF/WebP, and reserves aspect-ratio (no CLS).
          <Image
            src={restaurant.cover_url}
            alt={restaurant.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-red-500/20 to-danger/10" />
            <ChefHat className="w-20 h-20 text-brand-red-500/30 relative" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 relative">
        {/* Restaurant info card — glass style */}
        <div className="card glass-card backdrop-blur-xl p-5 mb-6 animate-slide-up">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white mb-1">
                {restaurant.name}
              </h1>
              {restaurant.description && (
                <p className="text-sm text-text-secondary leading-relaxed">
                  {restaurant.description}
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

        {/* Products list */}
        <div className="space-y-3 pb-24">
          <h2 className="text-lg font-bold text-white mb-3 px-1">{COPY.menu}</h2>
          {products.length === 0 ? (
            <EmptyState
              iconName="Leaf"
              title={COPY.noProductsTitle}
              description={COPY.noProductsDesc}
            />
          ) : (
            products.map((product, i) => (
              <div
                key={product.id}
                className="animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <ProductRow product={product} restaurant={restaurant} />
              </div>
            ))
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
    <div className="card glass-card p-3 sm:p-4 flex gap-3 sm:gap-4 hover:border-brand-red-500/40 hover:-translate-y-0.5 transition-all">
      {/* Image */}
      <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-sm overflow-hidden bg-surface relative">
        {product.image_urls?.[0] ? (
          // PERF: next/image with fill + sizes keeps the product card from
          // shifting when the image loads (CLS fix) and serves a smaller
          // 96–112 px image instead of the original 2000+ px JPEG.
          <Image
            src={product.image_urls[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 96px, 112px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-br from-surface to-bg">
            🍽️
          </div>
        )}
        {product.is_featured && (
          <span className="absolute top-1 right-1 inline-flex items-center bg-speed-gradient text-white text-[9px] px-1.5 py-0.5 rounded-pill font-bold shadow-speed-glow">
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


        <div className="flex items-center justify-between mt-auto pt-2">
          <div>
            <span className="text-base font-bold text-white">
              {formatEUR(price)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-text-muted line-through mr-2">
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