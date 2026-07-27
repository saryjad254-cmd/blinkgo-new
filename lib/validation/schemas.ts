/**
 * Zod Validation Schemas
 * ──────────────────────
 * Centralized input validation for all API routes.
 * Replaces ad-hoc manual validation with type-safe, documented schemas.
 */

import { z } from 'zod';

// ============================================
// Common
// ============================================

export const UuidSchema = z.string().uuid();
export const EmailSchema = z.string().email().max(255);
export const PhoneSchema = z.string().min(7).max(30);
export const PasswordSchema = z.string().min(8).max(128);
export const NameSchema = z.string().min(1).max(100);
export const UrlSchema = z.string().url();
export const LatSchema = z.number().min(-90).max(90);
export const LngSchema = z.number().min(-180).max(180);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AddressSchema = z.object({
  address: z.string().min(1).max(500),
  lat: LatSchema.optional().nullable(),
  lng: LngSchema.optional().nullable(),
  door: z.string().max(20).optional(),
  floor: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// Auth
// ============================================

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: NameSchema,
  phone: PhoneSchema.optional(),
  default_delivery_address: z.string().max(500).optional(),
  default_delivery_lat: LatSchema.optional(),
  default_delivery_lng: LngSchema.optional(),
});

export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
});

export const MagicLinkSchema = z.object({
  email: EmailSchema,
});

// ============================================
// Orders
// ============================================

const CartItemSchema = z.object({
  product_id: UuidSchema,
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(500).optional(),
});

export const OrderCreateSchema = z.object({
  restaurant_id: UuidSchema,
  items: z.array(CartItemSchema).min(1).max(100),
  payment_method: z.enum(['cash', 'stripe', 'card']),
  delivery_address: AddressSchema,
  tip: z.number().default(0).transform((v) => Math.min(500, Math.max(0, v))),
  coupon_code: z.string().max(50).optional(),
  scheduled_for: z.string().datetime().optional().nullable(),
  points_redeemed: z.number().int().min(0).default(0),
  notes: z.string().max(1000).optional(),
});

export const OrderCancelSchema = z.object({
  reason: z.string().min(1).max(200),
});

export const OrderRefundSchema = z.object({
  reason: z.enum([
    'food_quality',
    'wrong_order',
    'missing_items',
    'late_delivery',
    'damaged',
    'other',
  ]),
  notes: z.string().max(500).optional(),
});

// ============================================
// Driver
// ============================================

export const DriverLocationSchema = z.object({
  latitude: LatSchema,
  longitude: LngSchema,
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(200).optional(),
  accuracy: z.number().min(0).max(1000).optional(),
  active_order_id: UuidSchema.optional(),
});

export const DriverOnlineSchema = z.object({
  is_online: z.boolean(),
  latitude: LatSchema.optional(),
  longitude: LngSchema.optional(),
});

// ============================================
// Restaurant
// ============================================

export const RestaurantUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  address: z.string().min(1).max(500).optional(),
  latitude: LatSchema.optional(),
  longitude: LngSchema.optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
  cuisine: z.array(z.string().max(50)).max(20).optional(),
  min_order_amount: z.number().min(0).max(1000).optional(),
  delivery_fee: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

// ============================================
// Admin
// ============================================

export const AdminUserUpdateSchema = z.object({
  role: z.enum(['customer', 'driver', 'restaurant', 'admin', 'super_admin']).optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
});

export const AdminAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  type: z.enum(['info', 'warning', 'success', 'error', 'maintenance']).default('info'),
  target_roles: z.array(z.enum(['customer', 'driver', 'restaurant', 'admin'])).optional(),
  expires_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().default(true),
});

// ============================================
// Helpers
// ============================================

/**
 * Validate request body against a schema.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      return {
        success: false,
        error: `${firstError.path.join('.') || 'field'}: ${firstError.message}`,
      };
    }
    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }
}

export function parseQuery<T extends z.ZodTypeAny>(
  url: URL,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = schema.safeParse(params);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: `${firstError.path.join('.') || 'field'}: ${firstError.message}`,
    };
  }
  return { success: true, data: result.data };
}
