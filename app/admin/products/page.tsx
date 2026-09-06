import { requireRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminProductsClient, type CatalogCategory, type Product, type ProductRequest, type StoreOption } from '@/components/admin/AdminProductsClient';
import { cookies } from 'next/headers';
import { getServerLocale } from '@/lib/i18n/server-translations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminProductsPage() {
  const user = await requireRole('admin');
  const service = createServiceClient();
  const [{ data: products }, { data: requests }, { data: categories }, { data: stores }] = await Promise.all([
    service.from('products').select('id,name,description,category,category_id,price,image_url,is_active,is_available,approval_status,archived_at,restaurant:restaurant_id(id,name)').order('created_at', { ascending: false }),
    service.from('product_requests').select('*,restaurant:restaurant_id(id,name)').order('created_at', { ascending: false }),
    service.from('categories').select('id,restaurant_id,name,description,sort_order,is_active,is_hidden').order('sort_order').order('name'),
    service.from('restaurants').select('id,name,type').is('archived_at', null).order('name'),
  ]);
  const normalizedProducts: Product[] = (products ?? []).map(({ restaurant, ...product }) => ({
    ...product,
    price: Number(product.price ?? 0),
    restaurant: Array.isArray(restaurant) ? restaurant[0] ?? null : restaurant ?? null,
  }));
  const normalizedRequests: ProductRequest[] = (requests ?? []).map(({ restaurant, ...request }) => ({
    ...request,
    suggested_price: Number(request.suggested_price ?? 0),
    restaurant: Array.isArray(restaurant) ? restaurant[0] ?? null : restaurant ?? null,
  })) as ProductRequest[];
  const cookieHeader = (await cookies()).getAll().map((item) => `${item.name}=${item.value}`).join('; ');
  const locale = getServerLocale(cookieHeader);
  return <AdminLayout locale={locale} user={{ id: user.id, name: user.name || user.email || 'Admin', email: user.email || '', role: user.role as 'super_admin' | 'admin' | 'manager' }}><AdminProductsClient locale={locale} initialProducts={normalizedProducts} initialRequests={normalizedRequests} initialCategories={(categories ?? []) as CatalogCategory[]} stores={(stores ?? []) as StoreOption[]} /></AdminLayout>;
}
