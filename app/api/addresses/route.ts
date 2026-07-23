import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, addresses: data || [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { label, address, latitude, longitude, details, is_default } = body;

    if (!address || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ ok: false, error: 'address, latitude, longitude required' }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        customer_id: user.id,
        label: label || 'Home',
        address,
        latitude,
        longitude,
        details: details || null,
        is_default: !!is_default,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, address: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    if (updates.is_default) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .update(updates)
      .eq('id', id)
      .eq('customer_id', user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, address: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id)
      .eq('customer_id', user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
