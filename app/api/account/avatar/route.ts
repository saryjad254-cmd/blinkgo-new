import { NextRequest, NextResponse } from 'next/server';
import { getApiUserFromRequest } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { readValidatedPublicImage, storageObjectPath } from '@/lib/media/image-upload';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'avatar-images';
const MAX_BYTES = 2 * 1024 * 1024;

async function customer(request: NextRequest) {
  const auth = await getApiUserFromRequest(request);
  return auth?.user.isActive && auth.profile.role === 'customer' ? auth : null;
}

export async function POST(request: NextRequest) {
  const auth = await customer(request);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ ok: false, error: 'Multipart image upload required' }, { status: 415 });
    }
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BYTES + 256 * 1024) return NextResponse.json({ ok: false, error: 'Image request is too large' }, { status: 413 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Image file required' }, { status: 400 });
    const { bytes, mimeType, extension } = await readValidatedPublicImage(file, MAX_BYTES);
    const service = createServiceClient();
    const { data: current, error: readError } = await service.from('users').select('avatar_url').eq('id', auth.user.id).single();
    if (readError) return NextResponse.json({ ok: false, error: 'Profile could not be loaded' }, { status: 500 });
    const path = `${auth.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await service.storage.from(BUCKET).upload(path, Buffer.from(bytes), { contentType: mimeType, cacheControl: '31536000', upsert: false });
    if (uploadError) return NextResponse.json({ ok: false, error: safeErrorMessage(uploadError) }, { status: 500 });
    const url = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await service.from('users').update({ avatar_url: url, updated_at: new Date().toISOString() }).eq('id', auth.user.id);
    if (updateError) {
      await service.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ ok: false, error: 'Profile photo could not be saved' }, { status: 500 });
    }
    const oldPath = storageObjectPath(current?.avatar_url, BUCKET);
    if (oldPath && oldPath !== path) await service.storage.from(BUCKET).remove([oldPath]);
    await recordAudit({ actor_id: auth.user.id, action: 'profile.avatar.update', target_type: 'user', target_id: auth.user.id });
    return NextResponse.json({ ok: true, avatar_url: url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile photo upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('required') || message.includes('allowed') || message.includes('match') || message.includes('smaller') ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await customer(request);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const service = createServiceClient();
  const { data: current, error: readError } = await service.from('users').select('avatar_url').eq('id', auth.user.id).single();
  if (readError) return NextResponse.json({ ok: false, error: 'Profile could not be loaded' }, { status: 500 });
  const { error: updateError } = await service.from('users').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', auth.user.id);
  if (updateError) return NextResponse.json({ ok: false, error: 'Profile photo could not be removed' }, { status: 500 });
  const oldPath = storageObjectPath(current?.avatar_url, BUCKET);
  if (oldPath) await service.storage.from(BUCKET).remove([oldPath]);
  await recordAudit({ actor_id: auth.user.id, action: 'profile.avatar.remove', target_type: 'user', target_id: auth.user.id });
  return NextResponse.json({ ok: true, avatar_url: null });
}
