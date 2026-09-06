import { NextRequest, NextResponse } from 'next/server';
import { getApiUserFromRequest } from '@/lib/auth-helper';
import { issueOrderFinancialDocument } from '@/lib/financial-documents';
import { renderFinancialDocumentPdf } from '@/lib/pdf/financial-document';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUserFromRequest(request);
  const user = auth?.user;
  if (!user || !['customer', 'admin', 'super_admin'].includes(user.role)) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const document = await issueOrderFinancialDocument({ orderId: id, type: 'customer_receipt', actorId: user.id, expectedCustomerId: user.role === 'customer' ? user.id : undefined });
  if (!document) return NextResponse.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
  const pdf = await renderFinancialDocumentPdf(document);
  await recordAudit({ actor_id: user.id, action: 'FINANCIAL_DOCUMENT_DOWNLOADED', target_type: 'financial_document', target_id: document.id, metadata: { order_id: id, document_type: document.document_type }, ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), user_agent: request.headers.get('user-agent') ?? undefined });
  return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${document.document_number}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
