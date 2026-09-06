import { NextRequest, NextResponse } from 'next/server';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { DELIVERY_PROOF_BUCKET } from '@/lib/driver/delivery-outcome-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  return (await withSecurity(
    secureRoute('strict', ['customer', 'driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => getProof(ctx, id) as any,
  )(req)) as unknown as NextResponse;
}

async function getProof(ctx: { auth: { user: { id: string; role: string } } }, orderId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const service = createServiceClient();
    const [{ data: order }, { data: proof }] = await Promise.all([
      service.from('orders').select('id,customer_id,driver_id,status').eq('id', orderId).maybeSingle(),
      service.from('order_delivery_proofs').select('storage_path,mime_type,byte_size,captured_at,expires_at,deleted_at').eq('order_id', orderId).maybeSingle(),
    ]);
    if (!order || !proof || proof.deleted_at || new Date(proof.expires_at).getTime() <= Date.now()) throw new NotFoundError('Delivery proof');
    const isAdmin = ['admin', 'super_admin', 'manager'].includes(ctx.auth.user.role);
    if (!isAdmin && order.customer_id !== ctx.auth.user.id && order.driver_id !== ctx.auth.user.id) {
      throw new AuthorizationError('You cannot view this delivery proof');
    }
    const { data: signed, error } = await service.storage.from(DELIVERY_PROOF_BUCKET).createSignedUrl(proof.storage_path, 60);
    if (error || !signed?.signedUrl) throw new NotFoundError('Delivery proof');
    const response = ok({ proof: { url: signed.signedUrl, mime_type: proof.mime_type, byte_size: proof.byte_size, captured_at: proof.captured_at, expires_at: proof.expires_at } });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  });
}

export async function POST(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
}
