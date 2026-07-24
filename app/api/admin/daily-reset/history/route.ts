import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServiceClient();

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
