import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const restaurantId = request.nextUrl.searchParams.get('restaurant_id');
  const service = createServiceClient();
  let query = service.from('categories').select('id,restaurant_id,name,description,sort_order,is_active,is_hidden,created_at,updated_at').order('sort_order').order('name');
  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ ok: true, categories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId) || !name) return NextResponse.json({ ok: false, error: 'Valid store and category name are required' }, { status: 400 });
  const sortOrder = Number(body.sort_order ?? body.display_order ?? 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) return NextResponse.json({ ok: false, error: 'Invalid sort order' }, { status: 400 });
  const service = createServiceClient();
  const { data: store } = await service.from('restaurants').select('id').eq('id', restaurantId).is('archived_at', null).maybeSingle();
  if (!store) return NextResponse.json({ ok: false, error: 'Store not found' }, { status: 404 });
  const { data: duplicate } = await service.from('categories').select('id').eq('restaurant_id', restaurantId).ilike('name', name).maybeSingle();
  if (duplicate) return NextResponse.json({ ok: false, error: 'A category with this name already exists for the store' }, { status: 409 });
  const { data, error } = await service.from('categories').insert({
    restaurant_id: restaurantId,
    name,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 500) || null : null,
    sort_order: sortOrder,
    is_active: body.is_active !== false,
    is_hidden: body.is_hidden === true,
    created_by: admin.id,
    updated_by: admin.id,
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  await recordAudit({ actor_id: admin.id, action: 'catalog.category.create', target_type: 'catalog_category', target_id: data.id, metadata: { restaurant_id: restaurantId, name } });
  return NextResponse.json({ ok: true, category: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Valid category id required' }, { status: 400 });
  const updates: Record<string, unknown> = { updated_by: admin.id, updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) return NextResponse.json({ ok: false, error: 'Category name required' }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) || null : null;
  if (body.sort_order !== undefined || body.display_order !== undefined) {
    const sortOrder = Number(body.sort_order ?? body.display_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) return NextResponse.json({ ok: false, error: 'Invalid sort order' }, { status: 400 });
    updates.sort_order = sortOrder;
  }
  for (const field of ['is_active', 'is_hidden'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'boolean') return NextResponse.json({ ok: false, error: `${field} must be boolean` }, { status: 400 });
      updates[field] = body[field];
    }
  }
  if (Object.keys(updates).length === 2) return NextResponse.json({ ok: false, error: 'No supported category changes supplied' }, { status: 400 });
  const service = createServiceClient();
  const { data: existing } = await service.from('categories').select('restaurant_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, error: 'Category not found' }, { status: 404 });
  if (updates.name) {
    const { data: duplicate } = await service.from('categories').select('id').eq('restaurant_id', existing.restaurant_id).ilike('name', String(updates.name)).neq('id', id).maybeSingle();
    if (duplicate) return NextResponse.json({ ok: false, error: 'A category with this name already exists for the store' }, { status: 409 });
  }
  const { data, error } = await service.from('categories').update(updates).eq('id', id).select().maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Category not found' }, { status: 404 });
  if (updates.name) await service.from('products').update({ category: updates.name, updated_at: new Date().toISOString(), updated_by: admin.id }).eq('category_id', id);
  await recordAudit({ actor_id: admin.id, action: 'catalog.category.update', target_type: 'catalog_category', target_id: id, metadata: { changes: Object.keys(updates).filter((key) => !['updated_at', 'updated_by'].includes(key)) } });
  return NextResponse.json({ ok: true, category: data });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Valid category id required' }, { status: 400 });
  const service = createServiceClient();
  const { data, error } = await service.from('categories').delete().eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Category not found' }, { status: 404 });
  await recordAudit({ actor_id: admin.id, action: 'catalog.category.delete', target_type: 'catalog_category', target_id: id });
  return NextResponse.json({ ok: true });
}
