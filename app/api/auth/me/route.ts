/**
 * Get current authenticated user info
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  // /me is callable both unauthenticated (returns null) and authenticated
  // (returns the user). Don't require auth, but do apply lenient rate limit.
  return (await withSecurity(
    secureRoute('lenient'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => getMe() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function getMe(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return ok({ user: null, profile: null });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    return ok({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      profile: profile || { role: user.user_metadata?.role || 'customer' },
    });
  });
}
