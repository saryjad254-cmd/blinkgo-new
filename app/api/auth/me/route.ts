/**
 * Get current authenticated user info
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, user: null, profile: null });
    }

    // Get profile from public.users
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      profile: profile || { role: user.user_metadata?.role || 'customer' },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
