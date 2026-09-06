import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';
import { withSecurity, HandlerContext } from '@/lib/api/security';
import { ok, fail } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors';

export const dynamic = "force-dynamic";

const localAddressStore = new Map<string, Address[]>();

function isLocalMock(): boolean {
  return /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
}

/**
 * v81 SECURITY HARDENING — addresses route
 *
 * IDOR threat: prior to v81, the route manually called
 * `supabase.auth.getUser()` and then `eq('customer_id', user.id)`.
 * The customer_id filter is correct, but a future contributor could
 * accidentally drop the `customer_id` filter on PATCH/DELETE — an
 * attacker who knew another user's address UUID could read or modify
 * it. The route is now wrapped in `withSecurity` so:
 *   - `ctx.auth.user.id` is the authoritative authenticated user
 *   - all queries filter by that id, never by body-supplied customer_id
 *   - isActive + role checks are enforced centrally
 */
type Address = Record<string, unknown>;
type AddressListResponse = { addresses: Address[] };
type AddressSingleResponse = { address: Address | null };

const getHandler = withSecurity<AddressListResponse>(
  { roles: ['customer', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', ctx.auth.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isLocalMock()) return ok({ addresses: localAddressStore.get(ctx.auth.user.id) || [] });
      logger.error('addresses.GET: db error', { userId: ctx.auth.user.id }, error);
      return fail(new Error('Failed to load addresses'));
    }
    return ok({ addresses: (data || []) as Address[] });
  },
);

const postHandler = withSecurity<AddressSingleResponse>(
  { roles: ['customer', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const body = await ctx.req.json().catch(() => ({}));
    const { label, address, latitude, longitude, details, is_default } = body;

    if (!address || typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new ValidationError('address, latitude, longitude required');
    }

    const supabase = createServiceClient();
    // v81 SECURITY: customer_id is always taken from the authenticated
    // user — never from the request body — so an attacker cannot
    // create an address for another user.
    if (is_default) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', ctx.auth.user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        customer_id: ctx.auth.user.id,
        label: label || 'Home',
        address,
        latitude,
        longitude,
        details: details || null,
        is_default: !!is_default,
      })
      .select()
      .single();

    if (error) {
      if (isLocalMock()) {
        const current = localAddressStore.get(ctx.auth.user.id) || [];
        const created: Address = {
          id: crypto.randomUUID(),
          customer_id: ctx.auth.user.id,
          label: label || 'Home',
          address,
          latitude,
          longitude,
          details: details || null,
          is_default: Boolean(is_default) || current.length === 0,
          created_at: new Date().toISOString(),
        };
        const next = created.is_default ? current.map((item) => ({ ...item, is_default: false })) : current;
        localAddressStore.set(ctx.auth.user.id, [created, ...next]);
        return ok({ address: created });
      }
      logger.error('addresses.POST: db error', { userId: ctx.auth.user.id }, error);
      return fail(new Error('Failed to create address'));
    }

    return ok({ address: data as Address | null });
  },
);

const patchHandler = withSecurity<AddressSingleResponse>(
  { roles: ['customer', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const body = await ctx.req.json().catch(() => ({}));
    const { id, ...rawUpdates } = body;
    if (!id) throw new ValidationError('id required');

    // v81 SECURITY: whitelist updatable fields. Never spread raw
    // `...rawUpdates` into the update payload — a malicious client could
    // include `customer_id: <other-user>` to transfer ownership.
    const ALLOWED_KEYS = ['label', 'address', 'latitude', 'longitude', 'details', 'is_default'];
    const updates: Record<string, unknown> = {};
    for (const k of ALLOWED_KEYS) {
      if (rawUpdates[k] !== undefined) updates[k] = rawUpdates[k];
    }

    const supabase = createServiceClient();
    if (updates.is_default) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', ctx.auth.user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .update(updates)
      .eq('id', id)
      .eq('customer_id', ctx.auth.user.id) // IDOR guard
      .select()
      .single();

    if (error) {
      if (isLocalMock()) {
        const current = localAddressStore.get(ctx.auth.user.id) || [];
        const next = current.map((item) => {
          if (updates.is_default && item.id !== id) return { ...item, is_default: false };
          return item.id === id ? { ...item, ...updates } : item;
        });
        localAddressStore.set(ctx.auth.user.id, next);
        return ok({ address: next.find((item) => item.id === id) || null });
      }
      logger.error('addresses.PATCH: db error', { userId: ctx.auth.user.id, id }, error);
      return fail(new Error('Failed to update address'));
    }

    return ok({ address: data as Address | null });
  },
);

const deleteHandler = withSecurity<{ deleted: boolean }>(
  { roles: ['customer', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const { searchParams } = new URL(ctx.req.url);
    const id = searchParams.get('id');
    if (!id) throw new ValidationError('id required');

    const supabase = createServiceClient();
    // v81 SECURITY: filter on both id and customer_id so a user cannot
    // delete another user's address even by guessing the row id.
    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id)
      .eq('customer_id', ctx.auth.user.id);

    if (error) {
      if (isLocalMock()) {
        localAddressStore.set(ctx.auth.user.id, (localAddressStore.get(ctx.auth.user.id) || []).filter((item) => item.id !== id));
        return ok({ deleted: true });
      }
      logger.error('addresses.DELETE: db error', { userId: ctx.auth.user.id, id }, error);
      return fail(new Error('Failed to delete address'));
    }

    return ok({ deleted: true });
  },
);

export async function GET(req: NextRequest) { return getHandler(req); }
export async function POST(req: NextRequest) { return postHandler(req); }
export async function PATCH(req: NextRequest) { return patchHandler(req); }
export async function DELETE(req: NextRequest) { return deleteHandler(req); }
