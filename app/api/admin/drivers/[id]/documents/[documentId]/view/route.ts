import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; documentId: string }> }) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;
  const { id: driverId, documentId } = await context.params;
  try {
    const db = createServiceClient();
    const { data: document, error } = await db
      .from('driver_documents')
      .select('id,driver_id,document_type,document_url')
      .eq('id', documentId)
      .eq('driver_id', driverId)
      .maybeSingle();
    if (error) throw error;
    if (!document) return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });

    const prefix = 'storage://driver-documents/';
    if (!document.document_url.startsWith(prefix)) {
      return NextResponse.json({ ok: false, error: 'Private preview is unavailable for this legacy document' }, { status: 409 });
    }
    const path = document.document_url.slice(prefix.length);
    if (!path.startsWith(`${driverId}/`) || path.includes('..')) {
      return NextResponse.json({ ok: false, error: 'Invalid private document path' }, { status: 400 });
    }
    const { data: signed, error: signedError } = await db.storage.from('driver-documents').createSignedUrl(path, 120);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Unable to sign private document');

    await recordAudit({
      actor_id: auth.user.id,
      action: 'driver.document.view',
      target_type: 'driver_document',
      target_id: document.id,
      metadata: { driver_id: driverId, document_type: document.document_type, expires_in_seconds: 120 },
    });
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}
