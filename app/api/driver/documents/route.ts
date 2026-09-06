/**
 * Driver Documents API
 * ────────────────────
 * GET  /api/driver/documents         - List driver's documents
 * POST /api/driver/documents         - Upload a new document
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { DRIVER_DOCUMENT_TYPES, requiredDriverDocuments } from '@/lib/driver/verification';
import { listLocalDriverDocuments, localDriverDocuments } from '@/lib/driver/local-document-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: readonly string[] = DRIVER_DOCUMENT_TYPES;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const usesLocalSupabaseMock = /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');

function safeDocument(document: Record<string, unknown>) {
  const result = { ...document };
  delete result.document_url;
  return result;
}

function validFileSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'application/pdf') return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (mimeType === 'image/webp') return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

function parseOptionalExpiry(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ValidationError('Invalid expiry date');
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new ValidationError('Invalid expiry date');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsed < today) throw new ValidationError('Expiry date must not be in the past');
  return raw;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => listDocuments(ctx.auth.user.id) as any,
  )(req)) as unknown as NextResponse;
}

async function listDocuments(userId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServiceClient();
    let { data: driver } = await supabase.from('drivers').select('vehicle_type').eq('user_id', userId).maybeSingle();
    if (!driver) ({ data: driver } = await supabase.from('drivers').select('vehicle_type').eq('id', userId).maybeSingle());
    const requiredDocuments = requiredDriverDocuments(driver?.vehicle_type);
    const { data, error } = await supabase
      .from('driver_documents')
      .select('id,driver_id,document_type,document_number,expires_at,status,rejection_reason,uploaded_at,reviewed_at,submission_kind')
      .eq('driver_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      if (usesLocalSupabaseMock) {
        const documents = listLocalDriverDocuments(userId)
          .map((document) => safeDocument(document as unknown as Record<string, unknown>));
        return ok({ documents, required_documents: requiredDocuments });
      }
      logger.error('driver_documents fetch failed', { userId }, error);
      throw new Error('Failed to load driver documents');
    }
    return ok({ documents: data ?? [], required_documents: requiredDocuments });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('moderate', ['driver']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => uploadDocument(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function uploadDocument(userId: string, req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    if (req.headers.get('content-type')?.includes('application/json')) {
      return requestInsuranceNumberLookup(userId, req);
    }
    const isMultipart = req.headers.get('content-type')?.includes('multipart/form-data');
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (declaredLength > MAX_FILE_SIZE + 1024 * 1024) throw new ValidationError('Document request is too large');
    if (!isMultipart) throw new ValidationError('Driver documents must be uploaded as private multipart files');

    const form = await req.formData();
    const documentType = String(form.get('document_type') ?? '');
    if (!VALID_TYPES.includes(documentType)) {
      throw new ValidationError(`Invalid document type. Must be one of: ${VALID_TYPES.join(', ')}`);
    }
    const documentNumber = String(form.get('document_number') ?? '').trim().slice(0, 100) || null;
    const expiresAt = parseOptionalExpiry(form.get('expires_at'));
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ValidationError('A document file is required');
    const extension = ALLOWED_MIME_TYPES[file.type];
    if (!extension) throw new ValidationError('Only PDF, JPG, PNG and WebP files are allowed');
    if (file.size > MAX_FILE_SIZE) throw new ValidationError('Document file must be 10 MB or smaller');
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!validFileSignature(fileBytes, file.type)) throw new ValidationError('File content does not match its declared format');

    const bucket = 'driver-documents';
    const path = `${userId}/${documentType}-${crypto.randomUUID()}.${extension}`;
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from(bucket)
      .upload(path, Buffer.from(fileBytes), { contentType: file.type, cacheControl: 'no-store', upsert: false });
    let documentUrl = `storage://${bucket}/${path}`;
    if (uploadError) {
      if (usesLocalSupabaseMock) documentUrl = `mock-private://${bucket}/${path}`;
      else {
        logger.error('driver document upload failed', { userId, documentType }, uploadError);
        throw new Error('Failed to upload document securely');
      }
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: userId,
        document_type: documentType,
        document_url: documentUrl,
        document_number: documentNumber,
        expires_at: expiresAt,
        submission_kind: 'file',
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      if (usesLocalSupabaseMock) {
        const localDocument = {
          id: crypto.randomUUID(),
          driver_id: userId,
          document_type: documentType,
          document_url: documentUrl,
          document_number: documentNumber,
          expires_at: expiresAt,
          submission_kind: 'file',
          status: 'pending',
          rejection_reason: null,
          uploaded_at: new Date().toISOString(),
          reviewed_at: null,
        } as const;
        localDriverDocuments.set(localDocument.id, localDocument);
        return ok({ document: safeDocument(localDocument as unknown as Record<string, unknown>) });
      }
      await service.storage.from(bucket).remove([path]).catch(() => undefined);
      logger.error('driver_documents insert failed', { userId, documentType }, error);
      throw new Error('Failed to save document');
    }

    await supabase.from('driver_documents').update({
      status: 'rejected',
      rejection_reason: 'Superseded by a newer upload',
      reviewed_at: new Date().toISOString(),
    }).eq('driver_id', userId).eq('document_type', documentType).eq('status', 'pending').neq('id', data.id);

    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'info',
      userId,
      userRole: 'driver',
      resource: 'driver_document',
      resourceId: data.id,
      metadata: { document_type: documentType },
    });

    return ok({ document: safeDocument(data as Record<string, unknown>) });
  });
}

async function requestInsuranceNumberLookup(userId: string, req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== 'request_social_insurance_lookup') {
    throw new ValidationError('Unsupported driver document action');
  }

  const service = createServiceClient();
  const documentType = 'social_insurance_number_proof';
  const { data: existing, error: existingError } = await service
    .from('driver_documents')
    .select('id,driver_id,document_type,document_number,expires_at,status,rejection_reason,uploaded_at,reviewed_at,submission_kind')
    .eq('driver_id', userId)
    .eq('document_type', documentType)
    .eq('submission_kind', 'employer_lookup')
    .eq('status', 'pending')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError && !usesLocalSupabaseMock) throw existingError;
  if (existing) return ok({ document: existing, already_requested: true });

  if (usesLocalSupabaseMock) {
    const localExisting = listLocalDriverDocuments(userId).find((document) =>
      document.driver_id === userId
      && document.document_type === documentType
      && document.submission_kind === 'employer_lookup'
      && document.status === 'pending');
    if (localExisting) return ok({ document: safeDocument(localExisting as unknown as Record<string, unknown>), already_requested: true });
  }

  const record = {
    driver_id: userId,
    document_type: documentType,
    document_url: 'system://employer-insurance-number-lookup',
    document_number: null,
    expires_at: null,
    submission_kind: 'employer_lookup',
    status: 'pending',
  } as const;
  const { data, error } = await service.from('driver_documents').insert(record).select().single();
  if (error || !data) {
    if (!usesLocalSupabaseMock) throw error ?? new Error('Failed to create payroll lookup request');
    const localDocument = {
      id: crypto.randomUUID(),
      ...record,
      rejection_reason: null,
      uploaded_at: new Date().toISOString(),
      reviewed_at: null,
    };
    localDriverDocuments.set(localDocument.id, localDocument);
    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'info', userId, userRole: 'driver', resource: 'driver_document', resourceId: localDocument.id,
      metadata: { document_type: documentType, submission_kind: 'employer_lookup' },
    });
    return ok({ document: safeDocument(localDocument as unknown as Record<string, unknown>) });
  }

  await audit('ADMIN_CONFIG_CHANGED', {
    severity: 'info', userId, userRole: 'driver', resource: 'driver_document', resourceId: data.id,
    metadata: { document_type: documentType, submission_kind: 'employer_lookup' },
  });
  return ok({ document: safeDocument(data as Record<string, unknown>) });
}
