import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { InvitationRateLimitError, inviteAuthUser } from '@/lib/auth/admin-invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(['admin'], request);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    const { data, error } = await db.from('restaurants')
      .select('id,name,type,category,description,rating,total_orders,is_active,is_featured,is_paused,is_hidden,busy_mode,address,phone,latitude,longitude,logo_url,cover_url,opening_hours,delivery_radius_km,delivery_fee,min_order_amount,commission_pct,archived_at')
      .is('archived_at', null)
      .order('name')
      .limit(200);
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error), restaurants: [] }, { status: 200 });
    return NextResponse.json({ ok: true, restaurants: data || [] });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed', restaurants: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin'], req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const ownerName = typeof body.owner_name === 'string' ? body.owner_name.trim().slice(0, 100) : '';
    const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
    const clean = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const verification = {
      legal_name: clean(body.legal_name, 160),
      legal_form: clean(body.legal_form, 80) || null,
      representative_name: clean(body.representative_name, 120),
      contact_email: clean(body.contact_email, 200).toLowerCase(),
      contact_phone: clean(body.contact_phone, 40),
      street_address: clean(body.street_address, 250),
      postal_code: clean(body.postal_code, 5),
      city: clean(body.legal_city, 120),
      country_code: 'DE',
      trade_register_name: clean(body.trade_register_name, 160),
      trade_register_number: clean(body.trade_register_number, 100),
      vat_id: clean(body.vat_id, 40) || null,
      tax_number: clean(body.tax_number, 50) || null,
      identity_document_ref: clean(body.identity_document_ref, 300),
      business_document_ref: clean(body.business_document_ref, 300),
      payout_account_last4: clean(body.payout_account_last4, 4),
    };
    if (name.length < 2 || ownerName.length < 2 || !/^\S+@\S+\.\S+$/.test(ownerEmail)) {
      return NextResponse.json({ ok: false, error: 'Valid restaurant and owner data are required' }, { status: 400 });
    }
    const verificationComplete = verification.legal_name.length >= 2
      && verification.representative_name.length >= 2
      && /^\S+@\S+\.\S+$/.test(verification.contact_email)
      && verification.contact_phone.length >= 5
      && verification.street_address.length >= 5
      && /^\d{5}$/.test(verification.postal_code)
      && verification.city.length >= 2
      && verification.trade_register_name.length >= 2
      && verification.trade_register_number.length >= 2
      && verification.identity_document_ref.length >= 6
      && verification.business_document_ref.length >= 6
      && /^\d{4}$/.test(verification.payout_account_last4)
      && body.self_certified === true;
    if (!verificationComplete) {
      return NextResponse.json({ ok: false, error: 'Complete trader verification, protected document references, payout confirmation, and legal self-certification are required' }, { status: 400 });
    }
    const db = createServiceClient();
    const storeType = ['restaurant', 'market', 'pharmacy', 'shop'].includes(String(body.type)) ? String(body.type) : 'restaurant';
    let authUser;
    try {
      authUser = await inviteAuthUser({ client: db, email: ownerEmail, name: ownerName, phone: body.owner_phone || body.phone || null, role: 'restaurant', requestOrigin: req.nextUrl.origin });
    } catch (authError) {
      if (authError instanceof InvitationRateLimitError) {
        return NextResponse.json(
          { ok: false, error: safeErrorMessage(authError) },
          { status: 429, headers: { 'Retry-After': String(authError.retryAfterSeconds) } },
        );
      }
      return NextResponse.json({ ok: false, error: safeErrorMessage(authError) }, { status: 400 });
    }
    const ownerId = authUser.id;
    const { error: ownerError } = await db.from('users').upsert({ id: ownerId, email: ownerEmail, name: ownerName, phone: body.owner_phone || body.phone || null, role: 'restaurant', is_active: false, is_verified: false }, { onConflict: 'id' });
    if (ownerError) {
      await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
      return NextResponse.json({ ok: false, error: safeErrorMessage(ownerError) }, { status: 400 });
    }
    const { data, error } = await db.from('restaurants').insert({
      owner_id: ownerId,
      name,
      type: storeType,
      category: typeof body.category === 'string' ? body.category.trim().slice(0, 100) : null,
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null,
      address: typeof body.address === 'string' ? body.address.trim().slice(0, 250) : null,
      phone: typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : null,
      delivery_radius_km: Math.max(0.1, Math.min(100, Number(body.delivery_radius_km) || 5)),
      delivery_fee: Math.max(0, Math.min(100, Number(body.delivery_fee) || 0)),
      min_order_amount: Math.max(0, Math.min(1000, Number(body.min_order_amount) || 0)),
      commission_pct: Math.max(0, Math.min(100, Number(body.commission_pct) || 15)),
      latitude: Number.isFinite(Number(body.latitude)) ? Math.max(-90, Math.min(90, Number(body.latitude))) : null,
      longitude: Number.isFinite(Number(body.longitude)) ? Math.max(-180, Math.min(180, Number(body.longitude))) : null,
      opening_hours: body.opening_hours && typeof body.opening_hours === 'object' && !Array.isArray(body.opening_hours) ? body.opening_hours : {},
      is_active: false,
      is_featured: false,
      is_hidden: false,
    }).select().single();
    if (error) {
      await db.from('users').delete().eq('id', ownerId);
      await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
      return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: verificationError } = await db.from('restaurant_verifications').insert({
      restaurant_id: data.id,
      status: 'pending',
      ...verification,
      self_certified_at: now,
      submitted_at: now,
    });
    if (verificationError) {
      await db.from('restaurants').delete().eq('id', data.id);
      await db.from('users').delete().eq('id', ownerId);
      await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
      return NextResponse.json({ ok: false, error: safeErrorMessage(verificationError) }, { status: 400 });
    }

    const { error: ownerLinkError } = await db.from('users').update({ restaurant_id: data.id, updated_at: now }).eq('id', ownerId).eq('role', 'restaurant');
    if (ownerLinkError) {
      await db.from('restaurant_verifications').delete().eq('restaurant_id', data.id);
      await db.from('restaurants').delete().eq('id', data.id);
      await db.from('users').delete().eq('id', ownerId);
      await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
      return NextResponse.json({ ok: false, error: safeErrorMessage(ownerLinkError) }, { status: 400 });
    }

    await recordAudit({
      actor_id: auth.id,
      action: 'restaurant.create',
      target_type: 'restaurant',
      target_id: data.id,
      metadata: { name, type: storeType, category: body.category, owner_id: ownerId, owner_email: ownerEmail, verification_status: 'pending', published: false, activation: 'invite_sent' },
    });

    return NextResponse.json({ ok: true, activation: 'invite_sent', restaurant: data, owner: { id: ownerId, name: ownerName, email: ownerEmail }, verification_status: 'pending' }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
