/**
 * Referrals API
 * ─────────────
 * GET  /api/referrals?user_id=xxx  — List a user's referrals
 * POST /api/referrals               — Create a new invite
 * GET  /api/referrals/code?user_id= — Get the user's referral code
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ReferralService } from '@/lib/services/referral-service';
import { ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => listReferrals(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function listReferrals(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'code') {
      // Get/create referral code
      const { data: profile } = await supabase.from('users').select('name').eq('id', userId).single();
      const code = await ReferralService.ensureCode(userId, profile?.name ?? 'BKG');
      return ok({ code });
    }
    if (action === 'list') {
      const referrals = await ReferralService.listForUser(userId);
      return ok({ referrals });
    }
    return ok({});
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => createReferral(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function createReferral(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();

    const body = await req.json().catch(() => ({}));
    const { referee_email } = body;
    if (!referee_email) throw new ValidationError('referee_email required');
    // Get referrer code
    const { data: profile } = await supabase.from('users').select('name, referral_code').eq('id', userId).single();
    const code = await ReferralService.ensureCode(userId, profile?.name ?? 'BKG');
    const referral = await ReferralService.invite({
      referrerId: userId,
      refereeEmail: referee_email,
      code,
    });
    return ok({ referral });
  });
}
