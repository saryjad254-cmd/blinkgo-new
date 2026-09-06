import { requireRestaurantId } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { MenuManagerClient, type RestaurantMenuProduct } from '@/components/restaurant/MenuManagerClient';
import { getServerTranslations } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MenuPage() {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServiceClient();
  const [{ data: restaurant }, { data: products }, { data: categories }, pendingResult, { locale }] = await Promise.all([
    supabase.from('restaurants').select('id, name').eq('id', restaurantId).maybeSingle(),
    supabase
      .from('products')
      .select('id, name, description, price, discount_price, is_active, is_available, is_featured, sold_count, image_urls, stock, track_stock, category, preparation_time, prep_time, approval_status, archived_at')
      .eq('restaurant_id', restaurantId)
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true }),
    supabase.from('categories').select('id, name').eq('restaurant_id', restaurantId).order('name'),
    supabase.from('product_requests').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'pending'),
    getServerTranslations(),
  ]);

  const normalized = ((products ?? []) as RestaurantMenuProduct[]).map((product) => ({
    ...product,
    price: Number(product.price ?? 0),
    discount_price: product.discount_price == null ? null : Number(product.discount_price),
    sold_count: Number(product.sold_count ?? 0),
    stock: product.stock == null ? null : Number(product.stock),
    preparation_time: Number(product.preparation_time ?? product.prep_time ?? 15),
    is_active: product.is_active !== false,
    is_available: product.is_available !== false,
    is_featured: product.is_featured === true,
    track_stock: product.track_stock === true,
  }));

  return (
    <MenuManagerClient
      key={normalized.map((product) => `${product.id}:${product.is_available}:${product.price}:${product.stock}`).join('|')}
      restaurantName={restaurant?.name ?? 'BlinkGo'}
      initialProducts={normalized}
      categories={(categories ?? []) as Array<{ id: string; name: string }>}
      pendingRequests={pendingResult.count ?? 0}
      locale={locale}
    />
  );
}
