import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().default(''),
  category: z.string().trim().min(1).max(100),
  suggested_price: z.coerce.number().positive().max(9999),
  image_url: z.string().url().max(2000).optional().or(z.literal('')),
  preparation_time: z.coerce.number().int().min(1).max(180).optional().default(15),
});

async function restaurantContext() {
  const auth = await getApiUserWithRole();
  if (!auth || auth.profile.role !== 'restaurant' || !auth.user.isActive) return null;
  const { service, restaurantId } = await resolveOwnedRestaurant(auth.user.id);
  return restaurantId ? { auth, service, restaurantId } : null;
}

export async function GET() {
  const ctx = await restaurantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await ctx.service.from('product_requests').select('*').eq('restaurant_id', ctx.restaurantId).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await restaurantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const parsed = RequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const value = parsed.data;
  const { data, error } = await ctx.service.from('product_requests').insert({
    restaurant_id: ctx.restaurantId,
    requested_by: ctx.auth.user.id,
    name: value.name,
    description: value.description,
    category: value.category,
    suggested_price: value.suggested_price,
    image_url: value.image_url || null,
    product_data: { preparation_time: value.preparation_time },
    status: 'pending',
  }).select().single();
  if (error) {
    const duplicate = String((error as { code?: string }).code) === '23505';
    return NextResponse.json({ ok: false, error: duplicate ? 'A pending request with this name already exists' : safeErrorMessage(error) }, { status: duplicate ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, request: data }, { status: 201 });
}
