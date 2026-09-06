'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';

type Item = { id: string; product_name: string; product_price: number; quantity: number; subtotal: number; preference?: string };
type Product = { id: string; name: string; price: number; discount_price?: number | null };

export function ReplacementProposal({ orderId, items, products, locale }: { orderId: string; items: Item[]; products: Product[]; locale: 'de' | 'ar' | 'en' }) {
  const router = useRouter();
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const eligible = useMemo(() => items.filter((item) => item.preference && item.preference !== 'refund_item'), [items]);
  const [itemId, setItemId] = useState(eligible[0]?.id ?? '');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = locale === 'ar'
    ? { title: 'اقتراح بديل', body: 'يمكن اقتراح منتج مساوٍ أو أرخص فقط. لن يتم التطبيق قبل موافقة الزبون.', item: 'المنتج غير المتوفر', product: 'البديل المقترح', quantity: 'الكمية', reason: 'سبب أو ملاحظة (اختياري)', submit: 'إرسال الاقتراح للزبون', none: 'لا توجد عناصر تسمح بالاستبدال', offline: 'يلزم اتصال لإرسال الاقتراح.', sent: 'تم إرسال الاقتراح لمدة 10 دقائق.' }
    : locale === 'en'
      ? { title: 'Propose a substitute', body: 'Only an equal or lower-priced replacement is allowed. Nothing changes before customer consent.', item: 'Unavailable item', product: 'Proposed replacement', quantity: 'Quantity', reason: 'Reason or note (optional)', submit: 'Send proposal to customer', none: 'No items allow a replacement', offline: 'Connect to send a proposal.', sent: 'Proposal sent for 10 minutes.' }
      : { title: 'Ersatz vorschlagen', body: 'Nur gleich teure oder günstigere Artikel sind erlaubt. Ohne Zustimmung wird nichts geändert.', item: 'Nicht verfügbarer Artikel', product: 'Vorgeschlagener Ersatz', quantity: 'Menge', reason: 'Grund oder Hinweis (optional)', submit: 'Vorschlag an Kunden senden', none: 'Keine Position erlaubt einen Ersatz', offline: 'Zum Senden ist eine Verbindung erforderlich.', sent: 'Vorschlag für 10 Minuten gesendet.' };

  if (eligible.length === 0) return <p data-testid="replacement-proposal-empty" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-500">{copy.none}</p>;

  const submit = async () => {
    if (!network.isOnline) return toastError(copy.offline);
    if (!itemId || !productId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/restaurant/orders/${orderId}/replacements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_item_id: itemId, replacement_product_id: productId, replacement_quantity: quantity, reason }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload?.error?.message ?? 'Replacement proposal failed');
      success(copy.sent); setProductId(''); setReason(''); router.refresh();
    } catch (cause) { toastError(cause instanceof Error ? cause.message : 'Replacement proposal failed'); }
    finally { setBusy(false); }
  };

  return <section data-testid="replacement-proposal" className="rounded-[24px] border border-amber-300/20 bg-amber-300/[0.06] p-4 sm:p-5">
    <h2 className="flex items-center gap-2 text-lg font-black text-amber-200"><ArrowRightLeft className="h-5 w-5" />{copy.title}</h2>
    <p className="mt-1 text-xs leading-5 text-amber-100/70">{copy.body}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-zinc-400">{copy.item}<select data-testid="replacement-original-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#121216] px-3 text-sm text-white">{eligible.map((item) => <option key={item.id} value={item.id}>{item.quantity}× {item.product_name}</option>)}</select></label>
      <label className="text-xs font-bold text-zinc-400">{copy.product}<select data-testid="replacement-product" value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#121216] px-3 text-sm text-white"><option value="">—</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · €{Number(product.discount_price ?? product.price).toFixed(2)}</option>)}</select></label>
      <label className="text-xs font-bold text-zinc-400">{copy.quantity}<input data-testid="replacement-quantity" type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#121216] px-3 text-sm text-white" /></label>
      <label className="text-xs font-bold text-zinc-400">{copy.reason}<input data-testid="replacement-reason" maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#121216] px-3 text-sm text-white" /></label>
    </div>
    <button type="button" data-testid="replacement-submit" onClick={submit} disabled={!network.isOnline || !productId || busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#e10600] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}{copy.submit}</button>
  </section>;
}
