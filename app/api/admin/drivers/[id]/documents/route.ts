import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/rbac';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { isDriverVerificationComplete, requiredDriverDocuments } from '@/lib/driver/verification';
import { listLocalDriverDocuments, reviewLocalDriverDocument, type LocalDriverDocument } from '@/lib/driver/local-document-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  const { id: driverId } = await context.params;
  try {
    const body = await request.json();
    const documentId = typeof body.document_id === 'string' ? body.document_id : '';
    const decision = body.decision === 'approved' || body.decision === 'rejected' ? body.decision : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (!documentId || !decision || (decision === 'rejected' && reason.length < 3)) {
      return NextResponse.json({ ok: false, error: 'Document, valid decision, and rejection reason are required' }, { status: 400 });
    }

    const db = createServiceClient();
    const localMode = /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    const { data: databaseDocument, error: documentError } = await db
      .from('driver_documents')
      .select('id,driver_id,document_type,status,submission_kind')
      .eq('id', documentId)
      .eq('driver_id', driverId)
      .maybeSingle();
    if (documentError && !localMode) throw documentError;
    const localDocument = localMode
      ? listLocalDriverDocuments(driverId).find((entry) => entry.id === documentId) ?? null
      : null;
    const document = (databaseDocument ?? localDocument) as Pick<LocalDriverDocument, 'id' | 'driver_id' | 'document_type' | 'status' | 'submission_kind'> | null;
    if (!document) return NextResponse.json({ ok: false, error: 'Driver document not found' }, { status: 404 });
    if (document.submission_kind === 'employer_lookup' && decision === 'approved' && body.lookup_confirmed !== true) {
      return NextResponse.json({ ok: false, error: 'Payroll lookup must be completed before approval' }, { status: 400 });
    }

    if (localDocument) {
      const reviewed = reviewLocalDriverDocument(documentId, driverId, decision, reason || null, auth.user.id);
      if (!reviewed) return NextResponse.json({ ok: false, error: 'Driver document not found' }, { status: 404 });
      const localDocuments = listLocalDriverDocuments(driverId);
      const complete = isDriverVerificationComplete(null, localDocuments);
      await recordAudit({
        actor_id: auth.user.id,
        action: `driver.document.${decision}`,
        target_type: 'driver_document',
        target_id: documentId,
        metadata: { driver_id: driverId, document_type: document.document_type, submission_kind: document.submission_kind, reason: reason || null, verification_complete: complete, local_preview: true },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, complete, required_documents: requiredDriverDocuments(null) });
    }

    const { error: reviewError } = await db.from('driver_documents').update({
      status: decision,
      rejection_reason: decision === 'rejected' ? reason : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    }).eq('id', documentId).eq('driver_id', driverId);
    if (reviewError) throw reviewError;

    let { data: driver } = await db.from('drivers').select('id,user_id,vehicle_type').eq('user_id', driverId).maybeSingle();
    if (!driver) ({ data: driver } = await db.from('drivers').select('id,user_id,vehicle_type').eq('id', driverId).maybeSingle());
    if (!driver) return NextResponse.json({ ok: false, error: 'Driver profile not found' }, { status: 404 });

    const { data: documents, error: listError } = await db
      .from('driver_documents')
      .select('document_type,status,uploaded_at')
      .eq('driver_id', driverId);
    if (listError) throw listError;
    const complete = isDriverVerificationComplete(driver.vehicle_type, documents ?? []);

    // Reviewing evidence never silently enables dispatch. After the file is
    // complete an admin must still perform the separate activation action.
    const { error: userError } = await db.from('users').update({ is_verified: complete, is_active: false }).eq('id', driverId);
    if (userError) throw userError;
    const { error: driverError } = await db.from('drivers').update({
      is_approved: complete,
      status: 'pending',
      is_online: false,
      is_available: false,
    }).eq('id', driver.id);
    if (driverError) throw driverError;
    await db.from('driver_status').update({ is_online: false, is_on_delivery: false, current_order_id: null }).eq('driver_id', driverId);

    await recordAudit({
      actor_id: auth.user.id,
      action: `driver.document.${decision}`,
      target_type: 'driver_document',
      target_id: documentId,
      metadata: { driver_id: driverId, document_type: document.document_type, submission_kind: document.submission_kind, reason: reason || null, verification_complete: complete },
    });
    return NextResponse.json({ ok: true, complete, required_documents: requiredDriverDocuments(driver.vehicle_type) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}
