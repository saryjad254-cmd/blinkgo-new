import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { withSecurity, type HandlerContext } from '@/lib/api/security';
import { ok, fail } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type ProfileResponse = { profile: Record<string, unknown> | null };

const patchHandler = withSecurity<ProfileResponse>(
  { roles: ['customer', 'driver', 'restaurant', 'admin', 'super_admin', 'manager'] },
  async (ctx: HandlerContext) => {
    const body = await ctx.req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (name.length < 2 || name.length > 80) {
      throw new ValidationError('Name must be between 2 and 80 characters');
    }
    if (phone && !/^\+?[0-9 ()\-/]{7,24}$/.test(phone)) {
      throw new ValidationError('Invalid phone number');
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from('users')
      .update({ name, phone: phone || null, updated_at: new Date().toISOString() })
      .eq('id', ctx.auth.user.id)
      .select('id, email, name, phone, role, is_active, is_verified, created_at, last_login_at, avatar_url')
      .single();

    if (error) return fail(new Error('Failed to update profile'));
    return ok({ profile: data as Record<string, unknown> });
  },
);

export async function PATCH(req: NextRequest) {
  return patchHandler(req);
}
