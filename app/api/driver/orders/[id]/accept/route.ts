import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'driver') {
      return NextResponse.json({ error: 'NOT_A_DRIVER' }, { status: 403 });
    }

    // Check if driver is online (use service client for freshest data)
    const svc = createServiceClient();
    const { data: u } = await svc.auth.admin.getUserById(user.id);
    if (!u?.user?.user_metadata?.is_online) {
      return NextResponse.json({ error: 'NOT_ONLINE' }, { status: 400 });
    }

    // Atomic: assign driver to order only if status is one of {confirmed, preparing, ready} and driver_id is null
    const orderId = params.id;
    const { data, error } = await supabase
      .from('orders')
      .update({
        driver_id: user.id,
        accepted_at: new Date().toISOString(),
        // status: 'ready' is already there or moves to picked_up when driver picks up
      })
      .eq('id', orderId)
      .is('driver_id', null)
      .in('status', ['confirmed', 'preparing', 'ready'])
      .select()
      .single();

    if (error) {
      console.error('Accept order error:', error);
      return NextResponse.json(
        { error: 'ALREADY_TAKEN', details: error.message },
        { status: 409 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'ALREADY_TAKEN' },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    console.error('Accept route error:', e);
    return NextResponse.json(
      { error: 'SERVER_ERROR', details: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
