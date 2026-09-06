'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Check from 'lucide-react/dist/esm/icons/check';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import X from 'lucide-react/dist/esm/icons/x';
import { useToast } from '@/components/ui/Toast';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';

type Proposal = { id: string; original_product_name: string; replacement_product_name: string; original_line_total: number; replacement_line_total: number; replacement_quantity: number; reason?: string | null; status: string; expires_at: string };

export function ReplacementDecision({ orderId, proposals, locale }: { orderId: string; proposals: Proposal[]; locale: 'de' | 'ar' | 'en' }) {
  const router = useRouter(); const network = useOnlineStatus(); const { success, error: toastError } = useToast();
  const [now, setNow] = useState(0); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const first = window.setTimeout(() => setNow(Date.now()), 0); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.clearTimeout(first); window.clearInterval(timer); }; }, []);
  const copy = locale === 'ar' ? { title: 'بديل بانتظار موافقتك', from: 'بدلًا من', save: 'سيعاد لك', accept: 'قبول البديل', reject: 'رفض واسترداد المنتج', expired: 'انتهت مهلة الاقتراح', done: 'تم تسجيل قرارك.' } : locale === 'en' ? { title: 'A substitute needs your approval', from: 'Instead of', save: 'You receive back', accept: 'Accept substitute', reject: 'Reject and refund item', expired: 'Proposal expired', done: 'Your decision was saved.' } : { title: 'Ersatz benötigt Ihre Zustimmung', from: 'Statt', save: 'Sie erhalten zurück', accept: 'Ersatz annehmen', reject: 'Ablehnen und Artikel erstatten', expired: 'Vorschlag abgelaufen', done: 'Ihre Entscheidung wurde gespeichert.' };
  const open = proposals.filter((proposal) => proposal.status === 'proposed');
  if (!open.length) return null;
  const respond = async (proposalId: string, action: 'accept' | 'reject') => { if (!network.isOnline || busy) return; setBusy(proposalId); try { const response = await fetch(`/api/orders/${orderId}/replacements`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replacement_id: proposalId, action }) }); const payload = await response.json().catch(() => ({})); if (!response.ok || payload.ok === false) throw new Error(payload?.error?.message ?? 'Response failed'); success(copy.done); router.refresh(); } catch (cause) { toastError(cause instanceof Error ? cause.message : 'Response failed'); } finally { setBusy(null); } };
  return <section data-testid="replacement-decision" className="space-y-3">{open.map((proposal) => { const remaining = Math.max(0, Math.ceil((new Date(proposal.expires_at).getTime() - now) / 1000)); const expired = now > 0 && remaining === 0; const credit = Math.max(0, Number(proposal.original_line_total) - Number(proposal.replacement_line_total)); return <article key={proposal.id} className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-400/10 to-surface p-4 shadow-lg">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-text">{copy.title}</h2><p className="mt-1 text-xs text-text-muted">{copy.from}: {proposal.original_product_name}</p></div><span data-testid="replacement-countdown" className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-black text-amber-500"><Clock3 className="h-3.5 w-3.5" />{expired ? copy.expired : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span></div>
    <div className="mt-3 rounded-2xl border border-edge bg-surface-elevated p-3"><p className="font-extrabold text-text">{proposal.replacement_quantity}× {proposal.replacement_product_name}</p><p className="mt-1 text-sm text-text-secondary">€{Number(proposal.replacement_line_total).toFixed(2)}{credit > 0 ? ` · ${copy.save}: €${credit.toFixed(2)}` : ''}</p>{proposal.reason ? <p className="mt-2 text-xs text-text-muted">{proposal.reason}</p> : null}</div>
    <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" data-testid="replacement-reject" disabled={expired || !network.isOnline || Boolean(busy)} onClick={() => respond(proposal.id, 'reject')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-edge bg-surface-elevated text-sm font-bold text-text disabled:opacity-45"><X className="h-4 w-4" />{copy.reject}</button><button type="button" data-testid="replacement-accept" disabled={expired || !network.isOnline || Boolean(busy)} onClick={() => respond(proposal.id, 'accept')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-sm font-extrabold text-white disabled:opacity-45">{busy === proposal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{copy.accept}</button></div>
  </article>; })}</section>;
}
