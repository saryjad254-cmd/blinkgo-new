import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { MenuManagerClient } from '@/components/restaurant/MenuManagerClient';
import { cookies } from 'next/headers';
import type { Locale } from '@/lib/i18n/server-translations';
import { getServerLocale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';

async function getProducts(restaurantId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, discount_price, is_available, is_featured, sold_count, image_urls, stock, track_stock, category')
    .eq('restaurant_id', restaurantId)
    .order('is_featured', { ascending: false })
    .order('name', { ascending: true });

  if (error) return [];
  return data ?? [];
}

async function getCategories(restaurantId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .order('name');
  return data ?? [];
}

export default async function MenuPage() {
  const { restaurantId } = await requireRestaurantId();
  const [products, categories] = await Promise.all([
    getProducts(restaurantId),
    getCategories(restaurantId),
  ]);
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale: Locale = getServerLocale(cookieHeader);

  return (
    <>
      <PageHeader
        title="القائمة"
        subtitle={`${products.length} منتج`}
        action={
          <Link href="/restaurant/menu/new" className="btn-primary text-sm px-3 py-2">
            <Plus className="w-4 h-4 ms-1" />
            جديد
          </Link>
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {products.length === 0 ? (
          <EmptyState
            iconName="Utensils"
            title="القائمة فارغة"
            description="ابدأ بإضافة أول منتج لمطعمك"
            action={
              <Link href="/restaurant/menu/new" className="btn-primary">
                <Plus className="w-4 h-4 ms-2" />
                إضافة منتج
              </Link>
            }
          />
        ) : (
          <MenuManagerClient
            initialProducts={products.map((p: any) => ({
              id: p.id,
              name: p.name,
              price: Number(p.price),
              discount_price: p.discount_price ? Number(p.discount_price) : null,
              is_available: p.is_available ?? true,
              is_featured: p.is_featured ?? false,
              sold_count: p.sold_count ?? 0,
              stock: p.stock,
              track_stock: p.track_stock ?? false,
              category: p.category,
              image_urls: p.image_urls,
            }))}
            categories={categories}
            locale={locale}
            restaurantId={restaurantId}
          />
        )}
      </div>
    </>
  );
}
