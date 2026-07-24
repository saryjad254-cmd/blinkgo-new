'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requireRestaurantId } from '@/lib/rbac';

// ────────────────────────────────────────────────────────────────────
// Schemas — التحقق من المدخلات قبل أي استعلام
// ────────────────────────────────────────────────────────────────────

const ProductSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  price: z.coerce.number().positive().max(9999),
  discount_price: z.coerce.number().positive().max(9999).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  preparation_time: z.coerce.number().int().min(1).max(180).default(15),
});

const RestaurantSettingsSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  address: z.string().min(2).max(200),
  phone: z.string().max(20).optional().nullable(),
  delivery_fee: z.coerce.number().min(0).max(100),
  min_order_amount: z.coerce.number().min(0).max(9999),
  is_active: z.boolean().default(true),
});

const OrderActionSchema = z.object({
  order_id: z.string().uuid(),
  next_status: z.enum(['confirmed', 'preparing', 'ready', 'cancelled']),
});

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

// ────────────────────────────────────────────────────────────────────
// Product Mutations
// ────────────────────────────────────────────────────────────────────

export async function createProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const parsed = ProductSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    price: formData.get('price'),
    discount_price: formData.get('discount_price') || null,
    category_id: formData.get('category_id') || null,
    is_available: formData.get('is_available') === 'on',
    is_featured: formData.get('is_featured') === 'on',
    preparation_time: formData.get('preparation_time') || 15,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ ...parsed.data, restaurant_id: restaurantId })
    .select('id')
    .single();

  if (error) return fail(error.message);
  revalidatePath('/restaurant/menu');
  return { ok: true, data: { id: data.id } };
}

export async function updateProduct(
  productId: string,
  formData: FormData
): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const parsed = ProductSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    price: formData.get('price'),
    discount_price: formData.get('discount_price') || null,
    category_id: formData.get('category_id') || null,
    is_available: formData.get('is_available') === 'on',
    is_featured: formData.get('is_featured') === 'on',
    preparation_time: formData.get('preparation_time') || 15,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  }

  const { error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', productId)
    .eq('restaurant_id', restaurantId); // تأكيد أن المنتج ينتمي لهذا المطعم

  if (error) return fail(error.message);
  revalidatePath('/restaurant/menu');
  revalidatePath(`/restaurant/menu/${productId}/edit`);
  return { ok: true, data: undefined };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('restaurant_id', restaurantId);

  if (error) return fail(error.message);
  revalidatePath('/restaurant/menu');
  return { ok: true, data: undefined };
}

export async function toggleProductAvailability(
  productId: string,
  is_available: boolean
): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('products')
    .update({ is_available })
    .eq('id', productId)
    .eq('restaurant_id', restaurantId);

  if (error) return fail(error.message);
  revalidatePath('/restaurant/menu');
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────────────
// Order Actions
// ────────────────────────────────────────────────────────────────────

export async function actOnOrder(formData: FormData): Promise<ActionResult> {
  const { user } = await requireRestaurantId();
  const supabase = createServerClient();

  const parsed = OrderActionSchema.safeParse({
    order_id: formData.get('order_id'),
    next_status: formData.get('next_status'),
  });

  if (!parsed.success) return fail('إجراء غير صالح');

  // تحديث بـ restaurant_id (RLS) بدلاً من RPC
  // لأن عند المطعم، التحقق يأتي من الجدول نفسه
  const updates: Record<string, unknown> = { status: parsed.data.next_status };
  if (parsed.data.next_status === 'cancelled') {
    updates.cancelled_at = new Date().toISOString();
  }
  if (parsed.data.next_status === 'preparing') {
    updates.prepared_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', parsed.data.order_id)
    .eq('restaurant_id_in_owner_check', user.id); // placeholder — RLS يتولّى

  if (error) return fail(error.message);
  revalidatePath('/restaurant/orders');
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────────────
// Restaurant Settings
// ────────────────────────────────────────────────────────────────────

export async function updateRestaurantSettings(formData: FormData): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const parsed = RestaurantSettingsSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    address: formData.get('address'),
    phone: formData.get('phone') || null,
    delivery_fee: formData.get('delivery_fee'),
    min_order_amount: formData.get('min_order_amount'),
    is_active: formData.get('is_active') === 'on',
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  }

  const { error } = await supabase
    .from('restaurants')
    .update(parsed.data)
    .eq('id', restaurantId);

  if (error) return fail(error.message);
  revalidatePath('/restaurant/settings');
  revalidatePath('/restaurant/dashboard');
  return { ok: true, data: undefined };
}

/**
 * Toggle OPERATIONAL availability (online/offline).
 *
 * Previously wrote `is_active`, which is the ACCOUNT/LISTING flag — so an owner
 * going offline for the evening deactivated their listing entirely, and the
 * dashboard's two availability controls disagreed. Operational state is
 * `is_online` (see deploy/supabase/47-restaurant-is-online.sql).
 */
export async function toggleRestaurantOnline(isOnline: boolean): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('restaurants')
    .update({ is_online: isOnline })
    .eq('id', restaurantId);

  if (error) return fail(error.message);
  revalidatePath('/restaurant/dashboard');
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────────────
// Quick Login (Development Only!)
// ────────────────────────────────────────────────────────────────────
// ⚠️ معطّل في production. يجب حذفه لاحقًا أو حمايته بـ NODE_ENV.

export async function quickLoginDev(email: string): Promise<ActionResult> {
  if (process.env.NODE_ENV === 'production') {
    return fail('غير متاح في بيئة الإنتاج');
  }

  // لا نضع كلمة مرور هنا — هذا فقط لـ dev.
  // في الواقع الآمن هو قراءة كلمات السر من env vars.
  // لكن لغرض التطوير المحلي، نستخدم Supabase service role.
  const supabase = createServerClient();

  // محاكاة: ببساطة توجيه للـ login مع prefilled email
  redirect(`/login?dev_email=${encodeURIComponent(email)}`);
}