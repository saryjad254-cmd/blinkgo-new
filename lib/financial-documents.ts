import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { COMMISSION_RATE } from '@/lib/config/fees';

export type FinancialDocumentType = 'customer_receipt' | 'merchant_transaction_statement';

export interface FinancialDocumentSnapshot {
  schema_version: 1;
  document_type: FinancialDocumentType;
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  customer: { name: string; email: string | null };
  merchant: { name: string; address: string; legal_name: string | null; vat_id: string | null; tax_number: string | null };
  totals: { subtotal: number; delivery_fee: number; service_fee: number; tip: number; discount: number; total: number };
  merchant_settlement?: { commission_rate: number; commission_amount: number; merchant_net_before_adjustments: number };
  legal: { classification: 'receipt_not_tax_invoice' | 'transaction_statement_not_tax_invoice'; notice: string };
}

export interface IssuedFinancialDocument {
  id: string;
  document_number: string;
  document_type: FinancialDocumentType;
  snapshot: FinancialDocumentSnapshot;
  snapshot_sha256: string;
  issued_at: string;
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function issueOrderFinancialDocument(params: {
  orderId: string;
  type: FinancialDocumentType;
  actorId: string;
  expectedCustomerId?: string;
  expectedRestaurantId?: string;
}): Promise<IssuedFinancialDocument | null> {
  const db = createServiceClient();
  const { data: order } = await db.from('orders').select('*').eq('id', params.orderId).maybeSingle();
  if (!order) return null;
  if (params.expectedCustomerId && order.customer_id !== params.expectedCustomerId) return null;
  if (params.expectedRestaurantId && order.restaurant_id !== params.expectedRestaurantId) return null;
  if (!['delivered', 'cancelled', 'refunded'].includes(String(order.status))) return null;

  const { data: existing } = await db.from('financial_documents').select('*').eq('order_id', order.id).eq('document_type', params.type).maybeSingle();
  if (existing) return existing as IssuedFinancialDocument;

  const [{ data: itemRows }, { data: merchant }, { data: customer }, { data: verification }] = await Promise.all([
    db.from('order_items').select('id,product_name,product_price,quantity,subtotal,configuration').eq('order_id', order.id).order('id'),
    db.from('restaurants').select('id,name,address').eq('id', order.restaurant_id).maybeSingle(),
    db.from('users').select('id,name,email').eq('id', order.customer_id).maybeSingle(),
    db.from('restaurant_verifications').select('legal_name,vat_id,tax_number,status').eq('restaurant_id', order.restaurant_id).maybeSingle(),
  ]);
  if (!merchant || !customer) return null;

  const subtotal = money(order.subtotal);
  const commissionAmount = money(subtotal * COMMISSION_RATE);
  const snapshot: FinancialDocumentSnapshot = {
    schema_version: 1,
    document_type: params.type,
    order: {
      id: order.id,
      order_number: order.order_number ?? order.id.slice(0, 8),
      status: order.status,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      created_at: order.created_at,
      delivered_at: order.delivered_at ?? null,
    },
    items: (itemRows ?? []).map((item) => ({
      id: item.id,
      name: item.product_name,
      unit_price: money(item.product_price),
      quantity: Number(item.quantity ?? 0),
      line_total: money(item.subtotal),
      configuration: item.configuration ?? {},
    })),
    customer: { name: customer.name ?? 'BlinkGo Kunde', email: customer.email ?? null },
    merchant: {
      name: merchant.name,
      address: merchant.address ?? '',
      legal_name: verification?.status === 'approved' ? verification.legal_name : null,
      vat_id: verification?.status === 'approved' ? verification.vat_id : null,
      tax_number: verification?.status === 'approved' ? verification.tax_number : null,
    },
    totals: {
      subtotal,
      delivery_fee: money(order.delivery_fee),
      service_fee: money(order.service_fee),
      tip: money(order.tip),
      discount: money(order.discount),
      total: money(order.total),
    },
    legal: params.type === 'customer_receipt'
      ? { classification: 'receipt_not_tax_invoice', notice: 'Bestellbeleg - keine Rechnung im Sinne des Umsatzsteuergesetzes.' }
      : { classification: 'transaction_statement_not_tax_invoice', notice: 'Transaktionsübersicht - keine Auszahlungsbestätigung und keine Steuerrechnung.' },
    ...(params.type === 'merchant_transaction_statement' ? {
      merchant_settlement: {
        commission_rate: COMMISSION_RATE,
        commission_amount: commissionAmount,
        merchant_net_before_adjustments: money(subtotal - commissionAmount),
      },
    } : {}),
  };
  const snapshotSha256 = createHash('sha256').update(stableJson(snapshot)).digest('hex');
  const { data, error } = await db.rpc('issue_financial_document', {
    p_document_type: params.type,
    p_order_id: order.id,
    p_customer_id: order.customer_id,
    p_restaurant_id: order.restaurant_id,
    p_snapshot: snapshot,
    p_snapshot_sha256: snapshotSha256,
    p_created_by: params.actorId,
  });
  if (error) throw error;
  const issued = Array.isArray(data) ? data[0] : data;
  return issued as IssuedFinancialDocument;
}
