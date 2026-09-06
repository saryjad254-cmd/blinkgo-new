'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireRestaurantId } from '@/lib/rbac';

// ────────────────────────────────────────────────────────────────────
// Schemas — التحقق من المدخلات قبل أي استعلام
// ────────────────────────────────────────────────────────────────────

const OperationalProductSchema = z.object({
  price: z.coerce.number().positive().max(9999),
  discount_price: z.coerce.number().positive().max(9999).optional().nullable(),
  is_available: z.boolean().default(true),
  preparation_time: z.coerce.number().int().min(1).max(180).default(15),
  track_stock: z.boolean().default(false),
  stock: z.coerce.number().int().min(0).max(100000).nullable(),
  product_kind: z.enum(['prepared_food', 'prepacked_food', 'beverage', 'alcohol', 'non_food']),
  legal_name: z.string().trim().max(200).nullable(),
  net_quantity: z.coerce.number().positive().max(100000).nullable(),
  net_quantity_unit: z.enum(['g', 'kg', 'ml', 'l', 'm', 'm2', 'piece']).nullable(),
  ingredients_text: z.string().trim().max(5000).nullable(),
  allergens: z.array(z.string().trim().min(1).max(100)).max(50),
  additives: z.array(z.string().trim().min(1).max(100)).max(50),
  allergen_information_reviewed: z.boolean(),
  nutrition: z.record(z.string(), z.number().min(0).max(100000)),
  country_of_origin: z.string().trim().max(200).nullable(),
  producer_name: z.string().trim().max(200).nullable(),
  producer_address: z.string().trim().max(500).nullable(),
  storage_instructions: z.string().trim().max(1000).nullable(),
  usage_instructions: z.string().trim().max(1000).nullable(),
  alcohol_percentage: z.coerce.number().positive().max(100).nullable(),
  minimum_age: z.union([z.literal(16), z.literal(18)]).nullable(),
}).superRefine((value, ctx) => {
  if (value.discount_price != null && value.discount_price >= value.price) ctx.addIssue({ code: 'custom', message: 'Discount price must be lower than the regular price', path: ['discount_price'] });
  if (value.product_kind !== 'non_food' && !value.allergen_information_reviewed) ctx.addIssue({ code: 'custom', message: 'Allergen information must be reviewed before publishing', path: ['allergen_information_reviewed'] });
  if (['prepacked_food', 'beverage', 'alcohol'].includes(value.product_kind) && (!value.legal_name || !value.net_quantity || !value.net_quantity_unit)) ctx.addIssue({ code: 'custom', message: 'Legal name and net quantity are required for packaged products', path: ['legal_name'] });
  if (['prepacked_food', 'beverage'].includes(value.product_kind) && !value.ingredients_text) ctx.addIssue({ code: 'custom', message: 'Ingredients are required for packaged food and beverages', path: ['ingredients_text'] });
  if (value.product_kind === 'prepacked_food') {
    const required = ['energy_kj', 'fat_g', 'saturates_g', 'carbohydrate_g', 'sugars_g', 'protein_g', 'salt_g'];
    if (required.some((key) => value.nutrition[key] == null) || !value.producer_name || !value.producer_address) ctx.addIssue({ code: 'custom', message: 'Nutrition and producer details are required for prepacked food', path: ['nutrition'] });
  }
  if (value.product_kind === 'alcohol' && (!value.alcohol_percentage || !value.minimum_age || !value.producer_name)) ctx.addIssue({ code: 'custom', message: 'Alcohol strength, minimum age and producer are required', path: ['alcohol_percentage'] });
});

function nullableText(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function nullableNumber(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value ? Number(value) : null;
}

function textList(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
}

const RestaurantSettingsSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  address: z.string().min(2).max(200),
  phone: z.string().max(20).optional().nullable(),
  delivery_fee: z.coerce.number().min(0).max(100),
  min_order_amount: z.coerce.number().min(0).max(1000),
  is_active: z.boolean().default(true),
  pickup_enabled: z.boolean().default(false),
  pickup_instructions: z.string().trim().max(500).optional().nullable(),
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
  void formData;
  return fail('Direct publishing is disabled. Submit a product request for admin approval.');
}

export async function updateProduct(
  productId: string,
  formData: FormData
): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = await createServerClient();

  const parsed = OperationalProductSchema.safeParse({
    price: formData.get('price'),
    discount_price: formData.get('discount_price') || null,
    is_available: formData.get('is_available') === 'on',
    preparation_time: formData.get('preparation_time') || 15,
    track_stock: formData.get('track_stock') === 'on',
    stock: formData.get('track_stock') === 'on' ? formData.get('stock') || 0 : null,
    product_kind: formData.get('product_kind') || 'prepared_food',
    legal_name: nullableText(formData, 'legal_name'),
    net_quantity: nullableNumber(formData, 'net_quantity'),
    net_quantity_unit: nullableText(formData, 'net_quantity_unit'),
    ingredients_text: nullableText(formData, 'ingredients_text'),
    allergens: textList(formData, 'allergens'),
    additives: textList(formData, 'additives'),
    allergen_information_reviewed: formData.get('allergen_information_reviewed') === 'on',
    nutrition: Object.fromEntries(['energy_kj', 'energy_kcal', 'fat_g', 'saturates_g', 'carbohydrate_g', 'sugars_g', 'protein_g', 'salt_g'].flatMap((key) => {
      const value = nullableNumber(formData, key);
      return value == null ? [] : [[key, value]];
    })),
    country_of_origin: nullableText(formData, 'country_of_origin'),
    producer_name: nullableText(formData, 'producer_name'),
    producer_address: nullableText(formData, 'producer_address'),
    storage_instructions: nullableText(formData, 'storage_instructions'),
    usage_instructions: nullableText(formData, 'usage_instructions'),
    alcohol_percentage: nullableNumber(formData, 'alcohol_percentage'),
    minimum_age: nullableNumber(formData, 'minimum_age'),
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  }

  const { data: updated, error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!updated) return fail('Product changed before this action completed');
  revalidatePath('/restaurant/menu');
  revalidatePath(`/restaurant/menu/${productId}/edit`);
  return { ok: true, data: undefined };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  void productId;
  return fail('Only BlinkGo administrators can archive products.');
}

export async function toggleProductAvailability(
  productId: string,
  is_available: boolean
): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = await createServerClient();

  const { data: updated, error } = await supabase
    .from('products')
    .update({ is_available })
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!updated) return fail('Product changed before this action completed');
  revalidatePath('/restaurant/menu');
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────────────
// Order Actions
// ────────────────────────────────────────────────────────────────────

export async function actOnOrder(formData: FormData): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  // Ownership is established above from the authenticated restaurant session.
  // Perform the mutation with the server-only client because browser roles are
  // intentionally denied direct writes to the authoritative orders ledger.
  const supabase = createServiceClient();

  const parsed = OrderActionSchema.safeParse({
    order_id: formData.get('order_id'),
    next_status: formData.get('next_status'),
  });

  if (!parsed.success) return fail('إجراء غير صالح');

  const { data: order, error: loadError } = await supabase
    .from('orders')
    .select('id,status')
    .eq('id', parsed.data.order_id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (loadError) return fail(loadError.message);
  if (!order) return fail('Order not found');

  const allowedTransitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
  };
  if (!allowedTransitions[order.status]?.includes(parsed.data.next_status)) {
    return fail('Invalid order status transition');
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: parsed.data.next_status, updated_at: now };
  if (parsed.data.next_status === 'confirmed') updates.accepted_at = now;
  if (parsed.data.next_status === 'cancelled') updates.cancelled_at = now;
  if (parsed.data.next_status === 'preparing') updates.prepared_at = now;
  if (parsed.data.next_status === 'ready') updates.ready_at = now;

  const { data: updated, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', parsed.data.order_id)
    .eq('restaurant_id', restaurantId)
    .eq('status', order.status)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!updated) return fail('Order changed before this action completed');
  revalidatePath('/restaurant/orders');
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────────────
// Restaurant Settings
// ────────────────────────────────────────────────────────────────────

export async function updateRestaurantSettings(formData: FormData): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = await createServerClient();

  const parsed = RestaurantSettingsSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    address: formData.get('address'),
    phone: formData.get('phone') || null,
    delivery_fee: formData.get('delivery_fee'),
    min_order_amount: formData.get('min_order_amount'),
    is_active: formData.get('is_active') === 'on',
    pickup_enabled: formData.get('pickup_enabled') === 'on',
    pickup_instructions: nullableText(formData, 'pickup_instructions'),
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة');
  }

  const { data: updated, error } = await supabase
    .from('restaurants')
    .update(parsed.data)
    .eq('id', restaurantId)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!updated) return fail('Restaurant changed before this action completed');
  revalidatePath('/restaurant/settings');
  revalidatePath('/restaurant/dashboard');
  return { ok: true, data: undefined };
}

export async function toggleRestaurantOnline(isActive: boolean): Promise<ActionResult> {
  const { restaurantId } = await requireRestaurantId();
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('restaurants')
    .update({ is_active: isActive })
    .eq('id', restaurantId);

  if (error) return fail(error.message);
  revalidatePath('/restaurant/dashboard');
  return { ok: true, data: undefined };
}
