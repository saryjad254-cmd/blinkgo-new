/**
 * Driver Documents API
 * ────────────────────
 * GET  /api/driver/documents         - List driver's documents
 * POST /api/driver/documents         - Upload a new document
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['license', 'insurance', 'vehicle_registration', 'id_proof', 'background_check'];

export async function GET(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('driver_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logger.warn('driver_documents fetch failed', { userId: user.id }, error);
      return ok({ documents: [] });
    }
    return ok({ documents: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // Verify driver role
    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'driver') {
      throw new AuthorizationError('Only drivers can upload documents');
    }

    const body = await req.json().catch(() => ({}));
    const documentType = String(body.document_type ?? '');
    const documentUrl = String(body.document_url ?? '');
    const documentNumber = typeof body.document_number === 'string' ? body.document_number.slice(0, 100) : null;
    const expiresAt = body.expires_at ? new Date(body.expires_at).toISOString().split('T')[0] : null;

    if (!VALID_TYPES.includes(documentType)) {
      throw new ValidationError(`Invalid document type. Must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (!documentUrl || !documentUrl.startsWith('http')) {
      throw new ValidationError('document_url is required and must be a valid URL');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: user.id,
        document_type: documentType,
        document_url: documentUrl,
        document_number: documentNumber,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      logger.error('driver_documents insert failed', { userId: user.id, documentType }, error);
      throw new Error('Failed to save document');
    }

    return ok({ document: data });
  });
}
