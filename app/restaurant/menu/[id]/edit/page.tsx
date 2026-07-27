import { notFound } from 'next/navigation';
import { requireRestaurantId } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductForm } from '@/components/restaurant/ProductForm';

export const dynamic = 'force-dynamic';

async function getProduct(id: string, restaurantId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, price, discount_price, category_id, is_available, is_featured, preparation_time')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single();
  return { data, error };
}

async function getCategories(restaurantId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .order('name');
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const { restaurantId } = await requireRestaurantId();
  const [{ data: product }, categories] = await Promise.all([
    getProduct(params.id, restaurantId),
    getCategories(restaurantId),
  ]);

  if (!product) notFound();

  return (
    <>
      <PageHeader title={`تعديل: ${product.name}`} subtitle="عدّل التفاصيل أدناه" back />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="card">
          <ProductForm
            initial={product}
            categories={categories}
          />
        </div>
      </div>
    </>
  );
}