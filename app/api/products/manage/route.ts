/**
 * Product Management API
 * ──────────────────────
 * Full CRUD for products including:
 * - Multi-image upload
 * - Extras (e.g. cheese +1.50€)
 * - Sizes (S/M/L with different prices)
 * - Options (e.g. spicy level)
 * - Stock tracking
 * - Badges
 * - Display order
 * - Categories
 *
 * Restaurant owner or admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { sanitizeUrl } from '@/lib/validation';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getServiceClient() {
  return createServiceClient();
}

async function getRestaurantForUser(userId: string, role: string) {
  const supabase = getServiceClient();
  if (role === 'admin') return null; // admin manages all
  const { data } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  return data?.id || null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || !['restaurant', 'admin'].includes(auth.profile.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const restaurantId = await getRestaurantForUser(auth.user.id, auth.profile.role);
    const url = new URL(req.url);
    const queryRestaurantId = url.searchParams.get('restaurant_id') || restaurantId;

    if (!queryRestaurantId && auth.profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'No restaurant found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', queryRestaurantId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, products: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || !['restaurant', 'admin'].includes(auth.profile.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const restaurantId = await getRestaurantForUser(auth.user.id, auth.profile.role);
    const body = await req.json();

    if (!body.name || !body.price || !body.restaurant_id) {
      return NextResponse.json(
        { ok: false, error: 'name, price, restaurant_id are required' },
        { status: 400 }
      );
    }

    // Verify the restaurant belongs to this user (unless admin)
    if (auth.profile.role !== 'admin' && body.restaurant_id !== restaurantId) {
      return NextResponse.json({ ok: false, error: 'Cannot manage this restaurant' }, { status: 403 });
    }

    // SECURITY: validate all URLs (block javascript:, data:, file:, etc.)
    const imageUrlsIn = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 8) : [];
    const imageUrls = imageUrlsIn.map((u: unknown) => sanitizeUrl(u)).filter(Boolean) as string[];
    // Legacy single-image callers may still send `image_url`. The deployed
    // `products` table has NO image_url column, so that value is folded into
    // the image_urls array instead of being written to a column that does not
    // exist (production: "column products.image_url does not exist").
    const legacyImageUrl = sanitizeUrl(body.image_url);
    if (imageUrls.length === 0 && legacyImageUrl) imageUrls.push(legacyImageUrl);

    const productData = {
      restaurant_id: body.restaurant_id,
      name: body.name,
      description: body.description || '',
      price: Number(body.price),
      discount_price: body.discount_price ? Number(body.discount_price) : null,
      image_urls: imageUrls,
      category: body.category || null,
      cuisine: body.cuisine || null,
      is_available: body.is_available ?? true,
      is_featured: body.is_featured ?? false,
      preparation_time: Number(body.preparation_time ?? 15),
      stock: Number(body.stock ?? 0),
      track_stock: body.track_stock ?? false,
      display_order: Number(body.display_order ?? 0),
      badges: body.badges || [],
      ingredients: body.ingredients || [],
      extras: body.extras || [],
      sizes: body.sizes || [],
      options: body.options || [],
      requires_prescription: body.requires_prescription ?? false,
      market_section: body.market_section || null,
      pharmacy_category: body.pharmacy_category || null,
    };

    const { data, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || !['restaurant', 'admin'].includes(auth.profile.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const restaurantId = await getRestaurantForUser(auth.user.id, auth.profile.role);
    const body = await req.json();

    // v38 — Bulk operations
    if (Array.isArray(body.productIds) && body.productIds.length > 0) {
      // Verify all products belong to this restaurant
      const { data: prods } = await supabase
        .from('products')
        .select('id, restaurant_id, price')
        .in('id', body.productIds);
      if (auth.profile.role !== 'admin' && restaurantId) {
        for (const p of prods ?? []) {
          if (p.restaurant_id !== restaurantId) {
            return NextResponse.json({ ok: false, error: 'Cannot edit products from other restaurants' }, { status: 403 });
          }
        }
      }

      const updates: any = { updated_at: new Date().toISOString() };
      if (typeof body.is_available === 'boolean') updates.is_available = body.is_available;
      if (body.category) updates.category = body.category;

      // Apply price change
      if (body.priceChange) {
        const { type, value } = body.priceChange;
        const updated: any[] = [];
        for (const p of prods ?? []) {
          const oldPrice = Number(p.price);
          let newPrice = oldPrice;
          if (type === 'percent') {
            newPrice = Math.max(0, oldPrice * (1 + value / 100));
          } else {
            newPrice = Math.max(0, oldPrice + value);
          }
          newPrice = Math.round(newPrice * 100) / 100;
          await supabase.from('products').update({ price: newPrice, updated_at: new Date().toISOString() }).eq('id', p.id);
          updated.push({ id: p.id, price: newPrice });
        }
        return NextResponse.json({ ok: true, products: updated });
      }

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .in('id', body.productIds)
        .select('id, is_available, category, price');
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, products: data });
    }

    if (!body.id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Verify ownership
    if (auth.profile.role !== 'admin') {
      const { data: prod } = await supabase
        .from('products')
        .select('restaurant_id')
        .eq('id', body.id)
        .single();
      if (!prod || prod.restaurant_id !== restaurantId) {
        return NextResponse.json({ ok: false, error: 'Cannot edit this product' }, { status: 403 });
      }
    }

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) updates.price = Number(body.price);
    if (body.discount_price !== undefined) updates.discount_price = body.discount_price ? Number(body.discount_price) : null;
    if (body.image_urls !== undefined) {
      // Sanitize on update too (the create path already did) and never write
      // the nonexistent `image_url` column.
      const incoming = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 8) : [];
      updates.image_urls = incoming.map((u: unknown) => sanitizeUrl(u)).filter(Boolean) as string[];
    } else if (body.image_url !== undefined) {
      // Legacy single-image update → store in the array column.
      const single = sanitizeUrl(body.image_url);
      updates.image_urls = single ? [single] : [];
    }
    if (body.category !== undefined) updates.category = body.category;
    if (body.is_available !== undefined) updates.is_available = body.is_available;
    if (body.is_featured !== undefined) updates.is_featured = body.is_featured;
    if (body.preparation_time !== undefined) updates.preparation_time = Number(body.preparation_time);
    if (body.stock !== undefined) updates.stock = Number(body.stock);
    if (body.track_stock !== undefined) updates.track_stock = body.track_stock;
    if (body.display_order !== undefined) updates.display_order = Number(body.display_order);
    if (body.badges !== undefined) updates.badges = body.badges;
    if (body.ingredients !== undefined) updates.ingredients = body.ingredients;
    if (body.extras !== undefined) updates.extras = body.extras;
    if (body.sizes !== undefined) updates.sizes = body.sizes;
    if (body.options !== undefined) updates.options = body.options;
    if (body.requires_prescription !== undefined) updates.requires_prescription = body.requires_prescription;
    if (body.market_section !== undefined) updates.market_section = body.market_section;
    if (body.pharmacy_category !== undefined) updates.pharmacy_category = body.pharmacy_category;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getApiUserWithRole();
    if (!auth || !['restaurant', 'admin'].includes(auth.profile.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const restaurantId = await getRestaurantForUser(auth.user.id, auth.profile.role);
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Verify ownership
    if (auth.profile.role !== 'admin') {
      const { data: prod } = await supabase
        .from('products')
        .select('restaurant_id')
        .eq('id', body.id)
        .single();
      if (!prod || prod.restaurant_id !== restaurantId) {
        return NextResponse.json({ ok: false, error: 'Cannot delete this product' }, { status: 403 });
      }
    }

    const { error } = await supabase.from('products').delete().eq('id', body.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}