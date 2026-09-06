import { createServiceClient } from '@/lib/supabase/service';
import type { Restaurant } from '@/lib/types';
import type { RetailCatalogProduct } from '@/components/customer/RetailCatalogClient';

type RetailerRow = Record<string, unknown> & { id: string; name: string };
type ProductRow = Record<string, unknown> & { id: string; restaurant_id: string; name: string };

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export type RetailStorefront = 'market' | 'shop';

export async function loadRetailCatalog(storefront: RetailStorefront) {
  const service = createServiceClient();
  const { data: retailerRows, error: retailerError } = await service
    .from('restaurants')
    .select('*')
    .in('type', ['market', 'pharmacy'])
    .eq('is_active', true)
    .order('rating', { ascending: false })
    .limit(50);

  if (retailerError) return { retailers: [] as Restaurant[], products: [] as RetailCatalogProduct[], failed: true };

  const rows = (retailerRows ?? []) as RetailerRow[];
  const retailers = rows.map((row): Restaurant => {
    const deliveryMinutes = numberValue(row.delivery_time_min, 20);
    return {
      id: row.id,
      owner_id: typeof row.owner_id === 'string' ? row.owner_id : null,
      name: row.name,
      description: typeof row.description === 'string' ? row.description : null,
      logo_url: typeof (row.logo_url ?? row.image_url) === 'string' ? String(row.logo_url ?? row.image_url) : null,
      cover_url: typeof (row.cover_url ?? row.cover_image_url) === 'string' ? String(row.cover_url ?? row.cover_image_url) : null,
      address: typeof row.address === 'string' ? row.address : '',
      latitude: numberValue(row.latitude ?? row.lat),
      longitude: numberValue(row.longitude ?? row.lng),
      cuisine: stringArray(row.cuisine ?? row.cuisines),
      is_verified: row.is_verified !== false,
      is_active: row.is_active !== false,
      min_order_amount: numberValue(row.min_order_amount ?? row.minimum_order),
      delivery_fee: numberValue(row.delivery_fee),
      estimated_delivery_time: typeof row.estimated_delivery_time === 'string' ? row.estimated_delivery_time : `${deliveryMinutes}–${deliveryMinutes + 10} min`,
      rating: numberValue(row.rating),
      review_count: numberValue(row.review_count ?? row.total_reviews),
      is_featured: Boolean(row.is_featured ?? row.featured),
      phone: typeof row.phone === 'string' ? row.phone : null,
    };
  });

  if (retailers.length === 0) return { retailers, products: [] as RetailCatalogProduct[], failed: false };
  const retailerById = new Map(rows.map((row) => [row.id, row]));
  const { data: productRows, error: productError } = await service
    .from('products')
    .select('*')
    .in('restaurant_id', retailers.map((retailer) => retailer.id))
    .eq('approval_status', 'approved')
    .is('archived_at', null)
    .eq('is_available', true)
    .eq('storefront_vertical', storefront)
    .order('is_featured', { ascending: false })
    .order('sold_count', { ascending: false })
    .limit(100);

  if (productError) return { retailers, products: [] as RetailCatalogProduct[], failed: true };

  const products = ((productRows ?? []) as ProductRow[]).map((row): RetailCatalogProduct => {
    const seller = retailerById.get(row.restaurant_id);
    return {
      id: row.id,
      restaurant_id: row.restaurant_id,
      seller_name: seller?.name ?? 'BlinkGo Partner',
      seller_min_order: numberValue(seller?.min_order_amount ?? seller?.minimum_order),
      seller_available: seller?.is_active !== false && seller?.is_paused !== true && seller?.is_hidden !== true,
      seller_latitude: numberValue(seller?.latitude ?? seller?.lat),
      seller_longitude: numberValue(seller?.longitude ?? seller?.lng),
      seller_delivery_radius_km: numberValue(seller?.delivery_radius_km),
      name: row.name,
      description: typeof row.description === 'string' ? row.description : '',
      price: numberValue(row.price),
      discount_price: row.discount_price == null ? null : numberValue(row.discount_price),
      image_urls: stringArray(row.image_urls),
      category: typeof row.category === 'string' ? row.category : 'Other',
      is_vegetarian: Boolean(row.is_vegetarian),
      is_vegan: Boolean(row.is_vegan),
      is_gluten_free: Boolean(row.is_gluten_free),
      is_featured: Boolean(row.is_featured),
      is_available: row.is_available !== false,
      prep_time_min: numberValue(row.prep_time_min ?? row.preparation_time, 10),
      calories: row.calories == null ? undefined : numberValue(row.calories),
      allergens: stringArray(row.allergens),
      ingredients: stringArray(row.ingredients),
      product_kind: typeof row.product_kind === 'string' ? row.product_kind as RetailCatalogProduct['product_kind'] : undefined,
      legal_name: typeof row.legal_name === 'string' ? row.legal_name : null,
      net_quantity: row.net_quantity == null ? null : numberValue(row.net_quantity),
      net_quantity_unit: typeof row.net_quantity_unit === 'string' ? row.net_quantity_unit : null,
      base_price: row.base_price == null ? null : numberValue(row.base_price),
      base_price_unit: typeof row.base_price_unit === 'string' ? row.base_price_unit : null,
      ingredients_text: typeof row.ingredients_text === 'string' ? row.ingredients_text : null,
      additives: stringArray(row.additives),
      nutrition: row.nutrition && typeof row.nutrition === 'object' ? row.nutrition as Record<string, number> : {},
      country_of_origin: typeof row.country_of_origin === 'string' ? row.country_of_origin : null,
      producer_name: typeof row.producer_name === 'string' ? row.producer_name : null,
      producer_address: typeof row.producer_address === 'string' ? row.producer_address : null,
      storage_instructions: typeof row.storage_instructions === 'string' ? row.storage_instructions : null,
      usage_instructions: typeof row.usage_instructions === 'string' ? row.usage_instructions : null,
      alcohol_percentage: row.alcohol_percentage == null ? null : numberValue(row.alcohol_percentage),
      minimum_age: row.minimum_age === 16 || row.minimum_age === 18 ? row.minimum_age : null,
      legal_information_complete: row.legal_information_complete === true,
      sold_count: numberValue(row.sold_count),
      rating: numberValue(row.rating),
      modifiers: Array.isArray(row.modifiers) ? row.modifiers as RetailCatalogProduct['modifiers'] : [],
    };
  });

  return { retailers, products, failed: false };
}
