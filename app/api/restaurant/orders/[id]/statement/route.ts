import { NextRequest, NextResponse } from 'next/server';
import { getApiUserFromRequest } from '@/lib/auth-helper';
import { issueOrderFinancialDocument } from '@/lib/financial-documents';
import { renderFinancialDocumentPdf } from '@/lib/pdf/financial-document';
import { recordAudit } from '@/lib/audit/audit-trail';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUserFromRequest(request);
  const user = auth?.user;
  if (!user || !['restaurant', 'admin', 'super_admin'].includes(user.role)) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  let restaurantId: string | undefined;
  if (user.role === 'restaurant') {
    const service = createServiceClient();
    const { data: order } = await service.from('orders').select('restaurant_id').eq('id', id).maybeSingle();
    if (!order?.restaurant_id) return NextResponse.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
    const owned = await resolveOwnedRestaurant(user.id, order.restaurant_id);
    if (!owned.restaurantId) return NextResponse.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
    restaurantId = owned.restaurantId;
  }
  const document = await issueOrderFinancialDocument({ orderId: id, type: 'merchant_transaction_statement', actorId: user.id, expectedRestaurantId: restaurantId });
  if (!document) return NextResponse.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
  const pdf = await renderFinancialDocumentPdf(document);
  await recordAudit({ actor_id: user.id, action: 'FINANCIAL_DOCUMENT_DOWNLOADED', target_type: 'financial_document', target_id: document.id, metadata: { order_id: id, document_type: document.document_type }, ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), user_agent: request.headers.get('user-agent') ?? undefined });
  return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${document.document_number}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
