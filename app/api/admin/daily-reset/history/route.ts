import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: history } = await supabase
      .from('daily_stats')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);

    return NextResponse.json({
      ok: true,
      history: history || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, history: [] }, { status: 500 });
  }
}
