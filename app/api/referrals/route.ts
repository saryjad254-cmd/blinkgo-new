/**
 * Referrals API
 * ─────────────
 * GET  /api/referrals?user_id=xxx  — List a user's referrals
 * POST /api/referrals               — Create a new invite
 * GET  /api/referrals/code?user_id= — Get the user's referral code
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { ReferralService } from '@/lib/services/referral-service';
import { ValidationError, AuthenticationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'code') {
      // Get/create referral code
      const { data: profile } = await supabase.from('users').select('name').eq('id', user.id).single();
      const code = await ReferralService.ensureCode(user.id, profile?.name ?? 'BKG');
      return ok({ code });
    }
    if (action === 'list') {
      const referrals = await ReferralService.listForUser(user.id);
      return ok({ referrals });
    }
    return ok({});
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body = await req.json().catch(() => ({}));
    const { referee_email } = body;
    if (!referee_email) throw new ValidationError('referee_email required');
    // Get referrer code
    const { data: profile } = await supabase.from('users').select('name, referral_code').eq('id', user.id).single();
    const code = await ReferralService.ensureCode(user.id, profile?.name ?? 'BKG');
    const referral = await ReferralService.invite({
      referrerId: user.id,
      refereeEmail: referee_email,
      code,
    });
    return ok({ referral });
  });
}
