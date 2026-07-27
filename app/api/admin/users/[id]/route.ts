import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiRole(['admin', 'super_admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const db = createServiceClient();

    // v81 SECURITY: mass-assignment / privilege-escalation hardening.
    //
    // Only `super_admin` may change a user's role. `admin` and `manager`
    // can update profile fields (name, phone, is_active) but the role
    // field is dropped from the body before the DB write — otherwise a
    // non-super-admin operator could promote themselves or any user to
    // `super_admin` simply by sending `role: "super_admin"` in the
    // request body.
    //
    // The same restriction applies to `is_verified` (let only super_admin
    // mark a user as verified, e.g. after manual review).
    const isSuperAdmin = auth.role === 'super_admin';

    // Whitelist the updatable fields explicitly — never spread the
    // request body into the update payload.
    const safeUpdates: Record<string, unknown> = {};
    if (typeof body.full_name === 'string') {
      safeUpdates.full_name = body.full_name.slice(0, 100);
    }
    if (typeof body.phone === 'string') {
      safeUpdates.phone = body.phone.slice(0, 20);
    }
    if (typeof body.is_active === 'boolean') {
      safeUpdates.is_active = body.is_active;
    }
    if (isSuperAdmin) {
      // Only super_admin can change role or is_verified.
      if (typeof body.role === 'string') {
        const ALLOWED_ROLES = ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin'];
        if (!ALLOWED_ROLES.includes(body.role)) {
          return NextResponse.json({ ok: false, error: 'Invalid role' }, { status: 400 });
        }
        safeUpdates.role = body.role;
      }
      if (typeof body.is_verified === 'boolean') {
        safeUpdates.is_verified = body.is_verified;
      }
    }

    // Block the actor from editing themselves into a non-admin role
    // (would be a self-lockout and is almost always a mistake).
    if (params.id === auth.id && safeUpdates.role && safeUpdates.role !== 'super_admin' && safeUpdates.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'You cannot demote your own admin account here. Use a super_admin operator.' },
        { status: 403 },
      );
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No updatable fields' }, { status: 400 });
    }

    const { data, error } = await db
      .from('users')
      .update(safeUpdates)
      .eq('id', params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });

    await recordAudit({
      actor_id: auth.id,
      action: 'user.update',
      target_type: 'user',
      target_id: params.id,
      metadata: {
        changes: Object.keys(safeUpdates),
        // Log the actor's role for forensic traceability
        actor_role: auth.role,
        was_super_admin: isSuperAdmin,
      },
    });

    return NextResponse.json({ ok: true, user: data });
  } catch (e) {
    console.error('[admin/users PATCH]', e);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
