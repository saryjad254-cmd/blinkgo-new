import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurant_id');
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '200', 10) || 200));
  if (!restaurantId) return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 });
  const service = createServiceClient();
  const { data: store, error: storeError } = await service.from('restaurants').select('id').eq('id', restaurantId).eq('is_active', true).eq('is_hidden', false).is('archived_at', null).maybeSingle();
  if (storeError) return NextResponse.json({ products: [], total: 0, error: 'catalog_unavailable' }, { status: 503 });
  if (!store) return NextResponse.json({ products: [], total: 0, error: 'store_unavailable' }, { status: 404 });
  const [{ data, error }, { data: visibleCategories, error: categoryError }] = await Promise.all([
    service.from('products').select('*')
    .eq('restaurant_id', restaurantId)
    .eq('approval_status', 'approved')
    .is('archived_at', null)
    .eq('is_active', true)
    .eq('is_available', true)
    .order('is_featured', { ascending: false }).order('name').limit(limit),
    service.from('categories').select('id').eq('restaurant_id', restaurantId).eq('is_active', true).eq('is_hidden', false),
  ]);
  if (error || categoryError) {
    logger.error('Customer menu query failed', { restaurantId, error: (error ?? categoryError)?.message ?? 'unknown' });
    return NextResponse.json({ products: [], total: 0, error: 'catalog_unavailable' }, { status: 503 });
  }
  const allowedCategoryIds = new Set((visibleCategories ?? []).map((category) => category.id));
  const products = (data ?? []).filter((product) => !product.category_id || allowedCategoryIds.has(product.category_id));
  return NextResponse.json({ products, total: products.length });
}
