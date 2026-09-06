'use client';

import Image from 'next/image';
import { useState } from 'react';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Send from 'lucide-react/dist/esm/icons/send';
import X from 'lucide-react/dist/esm/icons/x';
import Lock from 'lucide-react/dist/esm/icons/lock';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Eye from 'lucide-react/dist/esm/icons/eye';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category: string;
  user_role: string;
  order_id?: string | null;
  created_at: string;
  updated_at: string;
  reference_code?: string;
  issue_type?: string;
  next_action?: string;
  sla_due_at?: string;
  resolution_summary?: string | null;
  users?: { name: string; email: string; role: string };
}

interface TicketReply {
  id: string;
  user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  users?: { name: string; role: string };
}

interface TicketAttachment {
  id: string;
  name: string;
  mime_type: string;
  byte_size: number;
  reply_id: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-info/15 text-info',
  in_progress: 'bg-warning/15 text-warning',
  waiting_user: 'bg-brand-yellow-500/15 text-brand-yellow-500',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-surface-light text-text-muted',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-text-muted',
  normal: 'text-info',
  high: 'text-warning',
  urgent: 'text-danger',
};

export function TicketList({ initialTickets }: { initialTickets: Ticket[] }) {
  const { locale } = useI18n();
  const dateLocale = locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-GB' : 'de-DE';
  const formatDate = (value: string) => new Intl.DateTimeFormat(dateLocale, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
  const [filter, setFilter] = useState<string>('all');
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [signedAttachments, setSignedAttachments] = useState<Record<string, string>>({});

  const filtered = filter === 'all' ? tickets : tickets.filter((ticket) => ticket.status === filter);
  const counts = {
    all: tickets.length,
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    in_progress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
    waiting_user: tickets.filter((ticket) => ticket.status === 'waiting_user').length,
    resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
  };

  async function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    setReplies([]);
    setAttachments([]);
    setSignedAttachments({});
    setError('');
    setLoadingThread(true);
    try {
      const response = await fetch(`/api/support?id=${encodeURIComponent(ticket.id)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(extractErrorMessage(payload, 'Could not load the conversation'));
      setReplies(payload.data?.replies ?? []);
      setAttachments(payload.data?.attachments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the conversation');
    } finally {
      setLoadingThread(false);
    }
  }

  async function toggleAttachment(id: string) {
    if (signedAttachments[id]) {
      setSignedAttachments((current) => { const next = { ...current }; delete next[id]; return next; });
      return;
    }
    setError('');
    try {
      const response = await fetch(`/api/support/attachments/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(extractErrorMessage(payload, 'Could not load attachment'));
      setSignedAttachments((current) => ({ ...current, [id]: payload.data.attachment.url }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load attachment');
    }
  }

  async function sendReply() {
    const message = replyMessage.trim();
    if (!selectedTicket || !message || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/support?id=${encodeURIComponent(selectedTicket.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, is_internal: isInternal }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(extractErrorMessage(payload, 'Could not send the reply'));
      setReplies((current) => [...current, payload.data.reply]);
      setReplyMessage('');
      const updatedAt = new Date().toISOString();
      setTickets((current) => current.map((ticket) => (
        ticket.id === selectedTicket.id ? { ...ticket, status: 'waiting_user', updated_at: updatedAt } : ticket
      )));
      setSelectedTicket((ticket) => ticket ? { ...ticket, status: 'waiting_user', updated_at: updatedAt } : ticket);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the reply');
    } finally {
      setSending(false);
    }
  }

  async function updateWorkflow(status: 'in_progress' | 'resolved') {
    if (!selectedTicket || sending) return;
    if (status === 'resolved' && !resolutionSummary.trim()) {
      setError('Add a resolution summary before resolving the ticket.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/support?id=${encodeURIComponent(selectedTicket.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status === 'resolved'
          ? { status, resolution_summary: resolutionSummary.trim() }
          : { status, next_action: 'waiting_support' }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(extractErrorMessage(payload, 'Could not update the ticket'));
      const updated = payload.data.ticket as Ticket;
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? { ...ticket, ...updated } : ticket));
      setSelectedTicket((ticket) => ticket ? { ...ticket, ...updated } : ticket);
      if (status === 'resolved') setResolutionSummary('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the ticket');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-text">Support Tickets</h1>
        <p className="mt-1 text-sm text-text-muted">{tickets.length} total · {counts.open} open</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'open', 'in_progress', 'waiting_user', 'resolved'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`min-h-11 rounded-full px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              filter === status ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white' : 'bg-bg-elevated text-text-secondary hover:bg-surface-light'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')} ({counts[status as keyof typeof counts] ?? 0})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card variant="glass" padding="lg">
          <p className="text-center text-text-muted">No tickets found</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <Card key={ticket.id} variant="glass" padding="none" hover>
              <button
                type="button"
                onClick={() => void openTicket(ticket)}
                className="w-full rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
                aria-label={`Open support ticket: ${ticket.subject}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-light">
                    <MessageCircle className="size-5 text-text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-2xs font-black uppercase tracking-wider text-brand-red">{ticket.reference_code ?? ticket.id.slice(0, 8)}</span>
                      <h3 className="text-sm font-bold text-text">{ticket.subject}</h3>
                      <span className={`inline-flex h-5 items-center rounded-full px-2 text-2xs font-bold ${STATUS_COLORS[ticket.status]}`}>{ticket.status.replace('_', ' ')}</span>
                      {ticket.priority === 'urgent' && <span className={`inline-flex items-center gap-1 text-2xs font-bold ${PRIORITY_COLORS[ticket.priority]}`}><AlertCircle className="size-3" />URGENT</span>}
                    </div>
                    <p className="line-clamp-1 text-xs text-text-muted">{ticket.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-text-muted">
                      <span>{ticket.users?.name ?? 'Customer'}{ticket.users?.email ? ` · ${ticket.users.email}` : ''}</span>
                      <span>·</span><span>{ticket.category}</span><span>·</span>
                      <Clock className="size-3" /><time dateTime={ticket.sla_due_at ?? ticket.updated_at}>SLA {formatDate(ticket.sla_due_at ?? ticket.updated_at)}</time>
                    </div>
                  </div>
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="ticket-title">
          <section className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-bg sm:rounded-3xl">
            <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-2xs font-bold ${STATUS_COLORS[selectedTicket.status]}`}>{selectedTicket.status.replace('_', ' ')}</span>
                  <span className="text-2xs font-bold uppercase text-text-muted">{selectedTicket.category}</span>
                </div>
                <h2 id="ticket-title" className="truncate text-lg font-black text-text">{selectedTicket.subject}</h2>
                <p className="mt-1 text-xs font-black uppercase tracking-wider text-brand-red">{selectedTicket.reference_code ?? selectedTicket.id.slice(0, 8)} · {selectedTicket.issue_type ?? selectedTicket.category}</p>
                {selectedTicket.order_id && <p className="mt-1 text-xs text-text-muted">Order: {selectedTicket.order_id}</p>}
                {selectedTicket.sla_due_at && <p className="mt-1 text-xs text-text-muted">Response SLA: {formatDate(selectedTicket.sla_due_at)} · Next: {(selectedTicket.next_action ?? 'waiting_support').replaceAll('_', ' ')}</p>}
              </div>
              <button type="button" onClick={() => setSelectedTicket(null)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-bg-elevated text-text-secondary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red" aria-label="Close ticket conversation"><X className="size-5" /></button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <article className="max-w-[88%] rounded-2xl rounded-tl-sm bg-bg-elevated p-3">
                <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-brand-yellow-500">Customer · original request</p>
                <p className="whitespace-pre-wrap text-sm text-text">{selectedTicket.message}</p>
                <AdminAttachments attachments={attachments.filter((item) => !item.reply_id)} signed={signedAttachments} onToggle={toggleAttachment} />
              </article>
              {loadingThread && <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted"><Loader2 className="size-4 animate-spin" />Loading conversation…</div>}
              {!loadingThread && replies.map((reply) => (
                <article key={reply.id} className={`max-w-[88%] rounded-2xl p-3 ${reply.is_internal ? 'border border-brand-yellow-500/30 bg-brand-yellow-500/10' : 'ml-auto rounded-tr-sm bg-brand-red/15'}`}>
                  <p className="mb-1 flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-text-muted">{reply.is_internal && <Lock className="size-3" />}{reply.is_internal ? 'Internal team note' : (reply.users?.name ?? 'Support reply')}</p>
                  <p className="whitespace-pre-wrap text-sm text-text">{reply.message}</p>
                  <AdminAttachments attachments={attachments.filter((item) => item.reply_id === reply.id)} signed={signedAttachments} onToggle={toggleAttachment} />
                  <time dateTime={reply.created_at} className="mt-1 block text-2xs text-text-muted">{formatDate(reply.created_at)}</time>
                </article>
              ))}
              {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
            </div>

            <footer className="border-t border-white/10 bg-bg-elevated/60 p-4 sm:p-5">
              {selectedTicket.status === 'open' && <button type="button" data-testid="support-admin-start-review" onClick={() => void updateWorkflow('in_progress')} disabled={sending} className="mb-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-info/30 bg-info/10 px-4 text-xs font-black text-info disabled:opacity-50">Start review</button>}
              <label htmlFor="support-reply" className="mb-2 block text-xs font-bold text-text-secondary">Reply to customer</label>
              <textarea id="support-reply" value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} maxLength={5000} rows={3} placeholder="Write a clear, helpful response…" className="w-full resize-none rounded-2xl border border-white/10 bg-bg p-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-brand-red focus:ring-2 focus:ring-brand-red/25" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-text-secondary"><input type="checkbox" checked={isInternal} onChange={(event) => setIsInternal(event.target.checked)} className="size-4 accent-brand-yellow-500" /><Lock className="size-4" />Internal note (hidden from customer)</label>
                <button type="button" onClick={() => void sendReply()} disabled={!replyMessage.trim() || sending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-red to-brand-red-hover px-5 text-sm font-black text-white shadow-lg shadow-brand-red/20 transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{sending ? 'Sending…' : (isInternal ? 'Add note' : 'Send reply')}
                </button>
              </div>
              {!['resolved', 'closed'].includes(selectedTicket.status) && <div className="mt-4 border-t border-white/10 pt-4"><label htmlFor="support-resolution" className="mb-2 block text-xs font-bold text-text-secondary">Resolution summary</label><textarea id="support-resolution" data-testid="support-admin-resolution" value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value.slice(0, 2000))} rows={2} placeholder="Describe the decision, refund or next completed action…" className="w-full resize-none rounded-2xl border border-white/10 bg-bg p-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-success focus:ring-2 focus:ring-success/20" /><button type="button" data-testid="support-admin-resolve" onClick={() => void updateWorkflow('resolved')} disabled={!resolutionSummary.trim() || sending} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-5 text-sm font-black text-white disabled:opacity-50"><CheckCircle2 className="size-4" />Resolve ticket</button></div>}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function AdminAttachments({ attachments, signed, onToggle }: { attachments: TicketAttachment[]; signed: Record<string, string>; onToggle: (id: string) => Promise<void> }) {
  if (!attachments.length) return null;
  return <div className="mt-3 space-y-2">{attachments.map((attachment) => <div key={attachment.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25">{signed[attachment.id] && <div className="relative aspect-video"><Image src={signed[attachment.id]} alt={attachment.name} fill unoptimized className="object-contain" /></div>}<button type="button" onClick={() => void onToggle(attachment.id)} className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-xs font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"><ShieldCheck className="size-4 text-success" /><span className="min-w-0 flex-1 truncate">{attachment.name}</span><Eye className="size-4" />View private photo</button></div>)}</div>;
}
