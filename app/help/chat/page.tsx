'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import Send from 'lucide-react/dist/esm/icons/send';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import User from 'lucide-react/dist/esm/icons/user';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { useI18n } from '@/lib/i18n/I18nProvider';

type ChatMessage = {
  id: string;
  from: 'me' | 'support';
  text: string;
  createdAt?: string;
};

type SupportTicket = {
  id: string;
  user_id: string;
  order_id: string | null;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TicketReply = {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
};

const COPY = {
  de: {
    title: 'Support-Chat', subtitle: 'Nachrichten werden sicher gespeichert', placeholder: 'Schreib deine Nachricht…',
    send: 'Senden', greeting: 'Hallo! 👋 Beschreibe kurz, wobei du Hilfe brauchst.',
    delivered: 'Nachricht gesendet. Der Support sieht sie jetzt.', loading: 'Unterhaltung wird geladen…',
    failed: 'Die Unterhaltung konnte nicht geladen werden.', sendFailed: 'Die Nachricht konnte nicht gesendet werden.',
    retry: 'Erneut versuchen', back: 'Zurück', available: 'Verfügbar', subject: 'Hilfe zur Bestellung', generalSubject: 'Support-Anfrage',
  },
  ar: {
    title: 'دردشة الدعم', subtitle: 'رسائلك محفوظة بأمان', placeholder: 'اكتب رسالتك…',
    send: 'إرسال', greeting: 'مرحباً! 👋 اشرح باختصار كيف يمكننا مساعدتك.',
    delivered: 'تم إرسال الرسالة وأصبحت ظاهرة لفريق الدعم.', loading: 'جارٍ تحميل المحادثة…',
    failed: 'تعذّر تحميل المحادثة.', sendFailed: 'تعذّر إرسال الرسالة.',
    retry: 'إعادة المحاولة', back: 'رجوع', available: 'متاح', subject: 'مساعدة بخصوص الطلب', generalSubject: 'طلب دعم',
  },
  en: {
    title: 'Support chat', subtitle: 'Your messages are stored securely', placeholder: 'Type your message…',
    send: 'Send', greeting: 'Hi! 👋 Briefly describe how we can help.',
    delivered: 'Message sent. The support team can now see it.', loading: 'Loading conversation…',
    failed: 'We could not load the conversation.', sendFailed: 'We could not send the message.',
    retry: 'Try again', back: 'Back', available: 'Available', subject: 'Help with order', generalSubject: 'Support request',
  },
};

async function readApi(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error?.message || 'Request failed');
  }
  return json?.data ?? json;
}

export default function HelpChatPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const { locale } = useI18n();
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyTicket = useCallback((ticket: SupportTicket, replies: TicketReply[]) => {
    const next: ChatMessage[] = [
      { id: `ticket-${ticket.id}`, from: 'me', text: ticket.message, createdAt: ticket.created_at },
      ...replies.map((reply) => ({
        id: reply.id,
        from: reply.user_id === ticket.user_id ? 'me' as const : 'support' as const,
        text: reply.message,
        createdAt: reply.created_at,
      })),
    ];
    setMessages(next);
  }, []);

  const loadTicket = useCallback(async (id: string, silent = false) => {
    try {
      const detail = await readApi(await fetch(`/api/support?id=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' }));
      applyTicket(detail.ticket as SupportTicket, (detail.replies ?? []) as TicketReply[]);
      setError(null);
    } catch {
      if (!silent) setError(t.failed);
    }
  }, [applyTicket, t.failed]);

  const loadConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readApi(await fetch('/api/support', { credentials: 'include', cache: 'no-store' }));
      const tickets = (data.tickets ?? []) as SupportTicket[];
      const active = tickets.find((ticket) =>
        !['resolved', 'closed'].includes(ticket.status) &&
        (orderId ? ticket.order_id === orderId : !ticket.order_id),
      );
      if (active) {
        setTicketId(active.id);
        await loadTicket(active.id);
      } else {
        setTicketId(null);
        setMessages([]);
      }
    } catch {
      setError(t.failed);
    } finally {
      setLoading(false);
    }
  }, [loadTicket, orderId, t.failed]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversation(), 0);
    return () => window.clearTimeout(timer);
  }, [loadConversation]);

  useEffect(() => {
    if (!ticketId) return;
    const timer = window.setInterval(() => void loadTicket(ticketId, true), 10_000);
    return () => window.clearInterval(timer);
  }, [loadTicket, ticketId]);

  async function send() {
    const message = text.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    setNotice(null);
    try {
      if (!ticketId) {
        const data = await readApi(await fetch('/api/support', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: orderId ? 'order_issue' : 'other',
            subject: orderId ? `${t.subject} #${orderId.slice(0, 8)}` : t.generalSubject,
            message,
            priority: 'normal',
            order_id: orderId,
          }),
        }));
        const ticket = data.ticket as SupportTicket;
        setTicketId(ticket.id);
        applyTicket(ticket, []);
      } else {
        const data = await readApi(await fetch(`/api/support?id=${encodeURIComponent(ticketId)}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }));
        const reply = data.reply as TicketReply;
        setMessages((current) => [...current, { id: reply.id, from: 'me', text: reply.message, createdAt: reply.created_at }]);
      }
      setText('');
      setNotice(t.delivered);
    } catch {
      setError(t.sendFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden flex flex-col" dir={dir}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-red-500/10 blur-[120px]" />
      </div>

      <header className="relative border-b border-edge bg-bg-elevated/60 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={orderId ? `/help?order=${encodeURIComponent(orderId)}` : '/help'}
            aria-label={t.back}
            className="p-2 -ms-2 rounded-lg hover:bg-bg-elevated transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-text-secondary rtl:rotate-180" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red-500/20 to-brand-yellow-500/20 border border-brand-red-500/30 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-brand-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-extrabold text-text">{t.title}</h1>
            <p className="text-xs text-text-muted">{t.subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-success">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {t.available}
          </span>
        </div>
      </header>

      <main className="relative flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-4 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4" aria-live="polite">
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-red-500 to-brand-red-700 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-bg-elevated border border-edge text-text text-sm leading-relaxed">
              {t.greeting}
            </div>
          </div>

          {loading && (
            <div role="status" className="flex items-center justify-center gap-2 py-5 text-sm text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> {t.loading}
            </div>
          )}

          {!loading && messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              {msg.from === 'support' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-red-500 to-brand-red-700 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.from === 'me'
                  ? 'bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white rounded-br-sm'
                  : 'bg-bg-elevated border border-edge text-text rounded-bl-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {error && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger flex items-center justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => void loadConversation()} className="inline-flex min-h-10 items-center gap-1.5 font-bold">
                <RefreshCw className="w-4 h-4" /> {t.retry}
              </button>
            </div>
          )}
          {notice && <p role="status" className="text-center text-xs font-semibold text-success">{notice}</p>}
        </div>

        <div className="sticky bottom-0 bg-bg/80 backdrop-blur-xl -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-t border-edge">
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex items-end gap-2">
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              maxLength={5000}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-2xl bg-bg-elevated border border-edge text-text placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label={t.send}
              disabled={!text.trim() || sending || loading}
              className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 hover:from-brand-red-600 hover:to-brand-red-700 text-white flex items-center justify-center shadow-glow active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rtl:rotate-180" />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
