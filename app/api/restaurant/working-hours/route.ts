import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { withSecurity, type HandlerContext } from '@/lib/api/security';
import { LONG_DAYS, SHORT_DAYS, isValidRestaurantTime, normalizeRestaurantHours } from '@/lib/restaurant-hours';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateHours(input: unknown) {
  if (Array.isArray(input)) {
    if (input.length !== 7) throw new ValidationError('A complete seven-day schedule is required');
    const seen = new Set<string>();
    for (const value of input) {
      if (!value || typeof value !== 'object') throw new ValidationError('Invalid schedule row');
      const row = value as { day?: unknown; is_open?: unknown; open_time?: unknown; close_time?: unknown };
      if (typeof row.day !== 'string' || ![...LONG_DAYS, ...SHORT_DAYS].includes(row.day as never) || seen.has(row.day)) throw new ValidationError('Every day must appear once');
      if (typeof row.is_open !== 'boolean') throw new ValidationError('Open status must be boolean');
      if (row.is_open && (!isValidRestaurantTime(row.open_time) || !isValidRestaurantTime(row.close_time))) throw new ValidationError('Opening and closing times must use HH:mm');
      seen.add(row.day);
    }
    return normalizeRestaurantHours(input);
  }
  if (!input || typeof input !== 'object') throw new ValidationError('hours must be a schedule object');
  for (const [day, value] of Object.entries(input as Record<string, unknown>)) {
    if (![...LONG_DAYS, ...SHORT_DAYS].includes(day as never)) throw new ValidationError(`Unknown schedule day: ${day}`);
    if (value == null || value === false) continue;
    const slot: { open?: unknown; close?: unknown; open_time?: unknown; close_time?: unknown; is_open?: unknown } = Array.isArray(value)
      ? { open: value[0], close: value[1] }
      : value as { open?: unknown; close?: unknown; open_time?: unknown; close_time?: unknown; is_open?: unknown };
    if (slot.is_open === false) continue;
    if (!isValidRestaurantTime(slot.open ?? slot.open_time) || !isValidRestaurantTime(slot.close ?? slot.close_time)) throw new ValidationError('Opening and closing times must use HH:mm');
  }
  return normalizeRestaurantHours(input);
}

async function ownedRestaurant(userId: string) {
  const { service, restaurantId } = await resolveOwnedRestaurant(userId);
  if (!restaurantId) throw new NotFoundError('Restaurant');
  const { data, error } = await service.from('restaurants').select('id,opening_hours').eq('id', restaurantId).maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Restaurant');
  return { service, restaurant: data };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const { restaurant } = await ownedRestaurant(ctx.auth.user.id);
    return ok({ hours: normalizeRestaurantHours(restaurant.opening_hours) });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const wrapped = withSecurity({ roles: ['restaurant'] }, async (ctx: HandlerContext) => withErrorHandling(async () => {
    const body = await ctx.req.json().catch(() => null);
    const hours = validateHours(body?.hours);
    const { service, restaurant } = await ownedRestaurant(ctx.auth.user.id);
    const { data: updated, error } = await service.from('restaurants').update({ opening_hours: hours, updated_at: new Date().toISOString() }).eq('id', restaurant.id).select('id').maybeSingle();
    if (error) { logger.error('Working hours save failed', { userId: ctx.auth.user.id }, error); throw new Error('Failed to save working hours'); }
    if (!updated) throw new ValidationError('Restaurant changed before the schedule was saved');
    return ok({ updated: true, hours });
  }));
  return (await wrapped(req)) as unknown as NextResponse;
}
