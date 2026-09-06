import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getApiUserFromRequest } from '@/lib/auth-helper';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { recordAudit } from '@/lib/audit/audit-trail';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'manager']);

type OwnedProduct = { id: string; restaurant_id: string; price: number | string | null };

async function context(request: NextRequest) {
  const auth = await getApiUserFromRequest(request);
  if (!auth || !auth.user.isActive) return null;
  const service = createServiceClient();
  if (ADMIN_ROLES.has(auth.profile.role)) return { auth, service, restaurantId: null, isAdmin: true };
  if (auth.profile.role !== 'restaurant') return null;
  const owned = await resolveOwnedRestaurant(auth.user.id);
  return { auth, service: owned.service, restaurantId: owned.restaurantId ?? null, isAdmin: false };
}

export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const requested = new URL(req.url).searchParams.get('restaurant_id');
  const restaurantId = ctx.isAdmin ? requested : ctx.restaurantId;
  if (!restaurantId) return NextResponse.json({ ok: false, error: 'restaurant_id required' }, { status: 400 });
  const { data, error } = await ctx.service.from('products').select('*').eq('restaurant_id', restaurantId).order('name');
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ ok: true, products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Restaurants must submit a product request for admin approval' }, { status: 403 });
  }
  const body = await req.json();
  const price = Number(body.price);
  const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId) || typeof body.name !== 'string' || body.name.trim().length < 2 || !Number.isFinite(price) || price <= 0 || price > 10_000) {
    return NextResponse.json({ ok: false, error: 'Valid restaurant, name and price are required' }, { status: 400 });
  }
  const { data: store, error: storeError } = await ctx.service.from('restaurants').select('id,type').eq('id', restaurantId).is('archived_at', null).maybeSingle();
  if (storeError) return NextResponse.json({ ok: false, error: safeErrorMessage(storeError) }, { status: 500 });
  if (!store) return NextResponse.json({ ok: false, error: 'Store not found' }, { status: 404 });
  let categoryId: string | null = null;
  let categoryName = typeof body.category === 'string' ? body.category.trim().slice(0, 100) || null : null;
  if (body.category_id != null && body.category_id !== '') {
    if (typeof body.category_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.category_id)) return NextResponse.json({ ok: false, error: 'Valid category required' }, { status: 400 });
    const { data: category } = await ctx.service.from('categories').select('id,name,restaurant_id').eq('id', body.category_id).maybeSingle();
    if (!category || category.restaurant_id !== restaurantId) return NextResponse.json({ ok: false, error: 'Category does not belong to this store' }, { status: 400 });
    categoryId = category.id;
    categoryName = category.name;
  }
  const defaultVertical = store.type === 'restaurant' ? 'restaurant' : store.type === 'shop' ? 'shop' : 'market';
  const storefrontVertical = ['restaurant', 'market', 'shop'].includes(body.storefront_vertical) ? body.storefront_vertical : defaultVertical;
  const now = new Date().toISOString();
  const { data, error } = await ctx.service.from('products').insert({
    restaurant_id: restaurantId,
    name: body.name.trim().slice(0, 100),
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '',
    category: categoryName,
    category_id: categoryId,
    storefront_vertical: storefrontVertical,
    price: Math.round(price * 100) / 100,
    image_url: typeof body.image_url === 'string' ? body.image_url : null,
    image_urls: typeof body.image_url === 'string' && body.image_url ? [body.image_url] : [],
    is_active: body.is_active !== false,
    is_available: body.is_available !== false,
    approval_status: 'approved', archived_at: null,
    created_by: ctx.auth.user.id, updated_by: ctx.auth.user.id,
    approved_by: ctx.auth.user.id, approved_at: now,
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  await recordAudit({ actor_id: ctx.auth.user.id, action: 'product.create', target_type: 'product', target_id: data.id, metadata: { restaurant_id: restaurantId, name: body.name.trim(), price } });
  return NextResponse.json({ ok: true, product: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const requestedIds: unknown[] = Array.isArray(body.productIds) ? body.productIds : body.id ? [body.id] : [];
  if (!requestedIds.length || requestedIds.length > 100 || requestedIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return NextResponse.json({ ok: false, error: 'Valid product id required' }, { status: 400 });
  }
  const ids = Array.from(new Set(requestedIds as string[]));
  if (ids.length !== requestedIds.length) return NextResponse.json({ ok: false, error: 'Duplicate product ids are not allowed' }, { status: 400 });

  const { data: owned, error: readError } = await ctx.service.from('products').select('id,restaurant_id,price').in('id', ids);
  if (readError) return NextResponse.json({ ok: false, error: safeErrorMessage(readError) }, { status: 500 });
  const ownedProducts = (owned ?? []) as OwnedProduct[];
  if (ownedProducts.length !== ids.length || (!ctx.isAdmin && ownedProducts.some((product) => product.restaurant_id !== ctx.restaurantId))) {
    return NextResponse.json({ ok: false, error: 'Cannot edit these products' }, { status: 403 });
  }

  if (body.action === 'restore') {
    if (!ctx.isAdmin) return NextResponse.json({ ok: false, error: 'Only admins can restore products' }, { status: 403 });
    const now = new Date().toISOString();
    const restored: Record<string, unknown>[] = [];
    for (const id of ids) {
      const { data, error } = await ctx.service.from('products').update({
        approval_status: 'approved', archived_at: null, is_active: true, is_available: true,
        updated_at: now, updated_by: ctx.auth.user.id,
      }).eq('id', id).select().single();
      if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
      const product = Array.isArray(data) ? data[0] : data;
      if (product) {
        restored.push(product);
        await recordAudit({ actor_id: ctx.auth.user.id, action: 'product.restore', target_type: 'product', target_id: product.id });
      }
    }
    return NextResponse.json({ ok: true, product: restored[0], products: restored });
  }

  const restaurantFields = ['price', 'discount_price', 'is_available', 'stock', 'stock_count', 'track_stock', 'preparation_time', 'prep_time'];
  const adminFields = [...restaurantFields, 'name', 'description', 'category', 'category_id', 'storefront_vertical', 'image_url', 'image_urls', 'is_featured', 'display_order', 'badges', 'ingredients', 'extras', 'sizes', 'options', 'is_active'];
  const allowed = ctx.isAdmin ? adminFields : restaurantFields;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.auth.user.id };
  for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key];

  for (const key of ['is_available', 'track_stock', 'is_featured', 'is_active']) {
    if (updates[key] !== undefined && typeof updates[key] !== 'boolean') {
      return NextResponse.json({ ok: false, error: `${key} must be boolean` }, { status: 400 });
    }
  }
  for (const key of ['stock', 'stock_count']) {
    if (updates[key] !== undefined) {
      const value = Number(updates[key]);
      if (!Number.isInteger(value) || value < 0 || value > 100_000) return NextResponse.json({ ok: false, error: 'Valid stock value required' }, { status: 400 });
      updates[key] = value;
    }
  }
  for (const key of ['preparation_time', 'prep_time']) {
    if (updates[key] !== undefined) {
      const value = Number(updates[key]);
      if (!Number.isInteger(value) || value < 1 || value > 180) return NextResponse.json({ ok: false, error: 'Preparation time must be between 1 and 180 minutes' }, { status: 400 });
      updates[key] = value;
    }
  }

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length < 2) return NextResponse.json({ ok: false, error: 'Valid product name required' }, { status: 400 });
    updates.name = updates.name.trim().slice(0, 100);
  }
  if (updates.description !== undefined && typeof updates.description === 'string') updates.description = updates.description.trim().slice(0, 1000);
  if (updates.category !== undefined && typeof updates.category === 'string') updates.category = updates.category.trim().slice(0, 100);
  if (updates.category_id !== undefined) {
    if (updates.category_id === '' || updates.category_id === null) {
      updates.category_id = null;
    } else if (typeof updates.category_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(updates.category_id)) {
      return NextResponse.json({ ok: false, error: 'Valid category required' }, { status: 400 });
    } else {
      const { data: category } = await ctx.service.from('categories').select('id,name,restaurant_id').eq('id', updates.category_id).maybeSingle();
      if (!category || ownedProducts.some((product) => product.restaurant_id !== category.restaurant_id)) {
        return NextResponse.json({ ok: false, error: 'Category does not belong to every selected product store' }, { status: 400 });
      }
      updates.category = category.name;
    }
  }
  if (updates.storefront_vertical !== undefined && !['restaurant', 'market', 'shop'].includes(String(updates.storefront_vertical))) {
    return NextResponse.json({ ok: false, error: 'Invalid storefront vertical' }, { status: 400 });
  }
  if (updates.price !== undefined) {
    const nextPrice = Number(updates.price);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice > 10_000) return NextResponse.json({ ok: false, error: 'Valid product price required' }, { status: 400 });
    updates.price = Math.round(nextPrice * 100) / 100;
  }

  if (updates.discount_price !== undefined && updates.discount_price !== null && updates.discount_price !== '') {
    const discount = Number(updates.discount_price);
    if (!Number.isFinite(discount) || discount <= 0 || discount > 10_000) return NextResponse.json({ ok: false, error: 'Valid discount price required' }, { status: 400 });
    updates.discount_price = Math.round(discount * 100) / 100;
  } else if (updates.discount_price === '') {
    updates.discount_price = null;
  }

  if (body.priceChange !== undefined) {
    const type = body.priceChange?.type;
    const value = Number(body.priceChange?.value);
    if (!['percent', 'fixed'].includes(type) || !Number.isFinite(value) || (type === 'percent' && (value < -99 || value > 1000)) || (type === 'fixed' && Math.abs(value) > 10_000)) {
      return NextResponse.json({ ok: false, error: 'Invalid price change' }, { status: 400 });
    }
  }

  if (Object.keys(updates).every((key) => ['updated_at', 'updated_by'].includes(key)) && body.priceChange === undefined) {
    return NextResponse.json({ ok: false, error: 'No supported product changes supplied' }, { status: 400 });
  }

  const changed: Array<Record<string, unknown>> = [];
  for (const product of ownedProducts) {
    const perProduct = { ...updates };
    if (body.priceChange) {
      const value = Number(body.priceChange.value);
      const oldPrice = Number(product.price);
      const nextPrice = Math.round((body.priceChange.type === 'percent' ? oldPrice * (1 + value / 100) : oldPrice + value) * 100) / 100;
      if (!Number.isFinite(nextPrice) || nextPrice < 0.01 || nextPrice > 10_000) return NextResponse.json({ ok: false, error: 'Price change would produce an invalid price' }, { status: 400 });
      perProduct.price = nextPrice;
    }
    if (perProduct.discount_price != null) {
      const basePrice = Number(perProduct.price ?? product.price);
      if (Number(perProduct.discount_price) >= basePrice) return NextResponse.json({ ok: false, error: 'Discount price must be lower than the regular price' }, { status: 400 });
    }
    const { data, error } = await ctx.service.from('products').update(perProduct).eq('id', product.id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
    const changedProduct = Array.isArray(data) ? data[0] : data;
    if (!changedProduct) return NextResponse.json({ ok: false, error: 'Product changed before this update completed' }, { status: 409 });
    changed.push(changedProduct as Record<string, unknown>);
    await recordAudit({ actor_id: ctx.auth.user.id, action: 'product.update', target_type: 'product', target_id: product.id, metadata: { changes: Object.keys(perProduct).filter((key) => !['updated_at', 'updated_by'].includes(key)) } });
  }
  return NextResponse.json({ ok: true, product: changed[0], products: changed });
}

export async function DELETE(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ ok: false, error: 'Only admins can archive products' }, { status: 403 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ ok: false, error: 'Product id required' }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await ctx.service.from('products').update({ approval_status: 'archived', archived_at: now, is_active: false, is_available: false, updated_by: ctx.auth.user.id, updated_at: now }).eq('id', body.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });
  await recordAudit({ actor_id: ctx.auth.user.id, action: 'product.archive', target_type: 'product', target_id: body.id });
  return NextResponse.json({ ok: true });
}
