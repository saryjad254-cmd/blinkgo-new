import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { withSecurity, type HandlerContext } from '@/lib/api/security';
import { isValidRestaurantTime, type RestaurantSpecialHour } from '@/lib/restaurant-hours';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseSpecialHour(input: unknown): RestaurantSpecialHour {
  if (!input || typeof input !== 'object') throw new ValidationError('Invalid special-hours entry');
  const value = input as Record<string, unknown>;
  if (typeof value.service_date !== 'string' || !DATE_PATTERN.test(value.service_date) || Number.isNaN(Date.parse(`${value.service_date}T00:00:00Z`))) {
    throw new ValidationError('service_date must use YYYY-MM-DD');
  }
  if (typeof value.is_closed !== 'boolean') throw new ValidationError('is_closed must be boolean');
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 160) : null;
  if (value.is_closed) return { service_date: value.service_date, is_closed: true, open_time: null, close_time: null, reason };
  if (!isValidRestaurantTime(value.open_time) || !isValidRestaurantTime(value.close_time)) {
    throw new ValidationError('Open special hours require valid HH:mm opening and closing times');
  }
  return {
    service_date: value.service_date,
    is_closed: false,
    open_time: value.open_time,
    close_time: value.close_time,
    reason,
  };
}

async function ownedRestaurant(userId: string) {
  const { service, restaurantId } = await resolveOwnedRestaurant(userId);
  if (!restaurantId) throw new NotFoundError('Restaurant');
  return { service, restaurantId };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const { service, restaurantId } = await ownedRestaurant(ctx.auth.user.id);
    const { data, error } = await service
      .from('restaurant_special_hours')
      .select('id,service_date,is_closed,open_time,close_time,reason')
      .eq('restaurant_id', restaurantId)
      .gte('service_date', new Date().toISOString().slice(0, 10))
      .order('service_date', { ascending: true })
      .limit(100);
    if (error) throw error;
    return ok({ special_hours: data ?? [] });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const body = await ctx.req.json().catch(() => null);
    const specialHour = parseSpecialHour(body);
    const { service, restaurantId } = await ownedRestaurant(ctx.auth.user.id);
    const { data, error } = await service
      .from('restaurant_special_hours')
      .upsert({
        restaurant_id: restaurantId,
        ...specialHour,
        created_by: ctx.auth.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'restaurant_id,service_date' })
      .select('id,service_date,is_closed,open_time,close_time,reason')
      .single();
    if (error) throw error;
    return ok({ special_hour: data });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const id = ctx.req.nextUrl.searchParams.get('id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Valid special-hours id is required');
    const { service, restaurantId } = await ownedRestaurant(ctx.auth.user.id);
    const { data, error } = await service
      .from('restaurant_special_hours')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Special hours');
    return ok({ deleted: true, id });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}
