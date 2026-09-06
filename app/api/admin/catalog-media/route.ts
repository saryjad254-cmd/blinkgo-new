import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { readValidatedPublicImage, storageObjectPath } from '@/lib/media/image-upload';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MediaKind = 'restaurant_logo' | 'restaurant_cover' | 'product_image';
const CONFIG: Record<MediaKind, { table: 'restaurants' | 'products'; bucket: string; column: 'logo_url' | 'cover_url' | 'image_url' }> = {
  restaurant_logo: { table: 'restaurants', bucket: 'restaurant-images', column: 'logo_url' },
  restaurant_cover: { table: 'restaurants', bucket: 'restaurant-images', column: 'cover_url' },
  product_image: { table: 'products', bucket: 'product-images', column: 'image_url' },
};
const MAX_BYTES = 5 * 1024 * 1024;

function config(kind: unknown) {
  return typeof kind === 'string' && kind in CONFIG ? CONFIG[kind as MediaKind] : null;
}

export async function POST(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json({ ok: false, error: 'Multipart image upload required' }, { status: 415 });
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BYTES + 256 * 1024) return NextResponse.json({ ok: false, error: 'Image request is too large' }, { status: 413 });
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const kind = String(form.get('kind') || '') as MediaKind;
    const media = config(kind);
    const file = form.get('file');
    if (!media || !/^[0-9a-f-]{36}$/i.test(id) || !(file instanceof File)) return NextResponse.json({ ok: false, error: 'Valid media target and image are required' }, { status: 400 });
    const { bytes, mimeType, extension } = await readValidatedPublicImage(file, MAX_BYTES);
    const service = createServiceClient();
    const { data: current, error: readError } = await service.from(media.table).select(`id,${media.column}`).eq('id', id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: safeErrorMessage(readError) }, { status: 500 });
    if (!current) return NextResponse.json({ ok: false, error: 'Media target not found' }, { status: 404 });
    const path = `${id}/${media.column}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await service.storage.from(media.bucket).upload(path, Buffer.from(bytes), { contentType: mimeType, cacheControl: '31536000', upsert: false });
    if (uploadError) return NextResponse.json({ ok: false, error: safeErrorMessage(uploadError) }, { status: 500 });
    const url = service.storage.from(media.bucket).getPublicUrl(path).data.publicUrl;
    const updates: Record<string, unknown> = { [media.column]: url, updated_at: new Date().toISOString() };
    if (media.table === 'products') updates.image_urls = [url];
    const { error: updateError } = await service.from(media.table).update(updates).eq('id', id);
    if (updateError) {
      await service.storage.from(media.bucket).remove([path]);
      return NextResponse.json({ ok: false, error: safeErrorMessage(updateError) }, { status: 500 });
    }
    const oldPath = storageObjectPath((current as Record<string, unknown>)[media.column], media.bucket);
    if (oldPath && oldPath !== path) await service.storage.from(media.bucket).remove([oldPath]);
    await recordAudit({ actor_id: admin.id, action: 'catalog.media.update', target_type: media.table === 'products' ? 'product' : 'restaurant', target_id: id, metadata: { kind } });
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('required') || message.includes('allowed') || message.includes('match') || message.includes('smaller') ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireApiRole(['admin'], request);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  const kind = typeof body.kind === 'string' ? body.kind as MediaKind : '' as MediaKind;
  const media = config(kind);
  if (!media || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Valid media target required' }, { status: 400 });
  const service = createServiceClient();
  const { data: current, error: readError } = await service.from(media.table).select(`id,${media.column}`).eq('id', id).maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: safeErrorMessage(readError) }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, error: 'Media target not found' }, { status: 404 });
  const updates: Record<string, unknown> = { [media.column]: null, updated_at: new Date().toISOString() };
  if (media.table === 'products') updates.image_urls = [];
  const { error: updateError } = await service.from(media.table).update(updates).eq('id', id);
  if (updateError) return NextResponse.json({ ok: false, error: safeErrorMessage(updateError) }, { status: 500 });
  const path = storageObjectPath((current as Record<string, unknown>)[media.column], media.bucket);
  if (path) await service.storage.from(media.bucket).remove([path]);
  await recordAudit({ actor_id: admin.id, action: 'catalog.media.remove', target_type: media.table === 'products' ? 'product' : 'restaurant', target_id: id, metadata: { kind } });
  return NextResponse.json({ ok: true, url: null });
}
