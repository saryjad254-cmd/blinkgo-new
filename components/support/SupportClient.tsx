'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, CheckCircle2, MessageCircle, Clock, ChevronRight, Plus, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useT, tr } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const CATEGORIES = [
  { key: 'order_issue',     de: 'Bestellproblem',  ar: 'مشكلة في الطلب', en: 'Order issue' },
  { key: 'payment',         de: 'Zahlung',          ar: 'الدفع',            en: 'Payment' },
  { key: 'account',         de: 'Konto',            ar: 'الحساب',           en: 'Account' },
  { key: 'technical',       de: 'Technisch',        ar: 'تقني',             en: 'Technical' },
  { key: 'feature_request', de: 'Funktionswunsch',  ar: 'طلب ميزة',         en: 'Feature request' },
  { key: 'other',           de: 'Sonstiges',        ar: 'أخرى',             en: 'Other' },
];

const STATUS_MAP = {
  open:        { color: 'bg-info/15 text-info border-info/30',     de: 'Offen',          ar: 'مفتوحة', en: 'Open' },
  in_progress: { color: 'bg-warning/15 text-warning border-warning/30', de: 'In Bearbeitung', ar: 'قيد المعالجة', en: 'In progress' },
  waiting_user: { color: 'bg-brand-yellow-500/15 text-brand-yellow-500 border-brand-yellow-500/30', de: 'Wartet auf Sie', ar: 'بانتظارك', en: 'Waiting for you' },
  resolved:    { color: 'bg-success/15 text-success border-success/30', de: 'Gelöst',        ar: 'تم الحل', en: 'Resolved' },
  closed:      { color: 'bg-surface-light text-text-muted border-edge', de: 'Geschlossen', ar: 'مغلقة', en: 'Closed' },
};

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: keyof typeof STATUS_MAP;
  created_at: string;
  updated_at: string;
}

interface Reply {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  users?: { name: string; role: string };
}

/**
 * In-app support system.
 *  - List user's tickets
 *  - Create new ticket
 *  - View ticket + replies
 *  - Reply to ticket
 */
export function SupportClient({ userRole }: { userRole: 'customer' | 'driver' | 'restaurant' }) {
  const t = useT();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('normal');
  const [orderId, setOrderId] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/support');
      const json = await res.json();
      if (json.ok) setTickets(json.data.tickets ?? []);
    } catch {}
    setLoading(false);
  };

  const loadTicket = async (id: string) => {
    try {
      const res = await fetch(`/api/support?id=${id}`);
      const json = await res.json();
      if (json.ok) {
        setSelectedTicket(json.data.ticket);
        setReplies(json.data.replies ?? []);
      }
    } catch {}
  };

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ type: 'error', message: 'Subject and message required' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          category,
          priority,
          order_id: orderId || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ type: 'success', message: 'Ticket created' });
        setView('list');
        setSubject(''); setMessage(''); setOrderId('');
        loadTickets();
      } else {
        toast({ type: 'error', message: json.error?.message || 'Failed' });
      }
    } catch (e: any) {
      toast({ type: 'error', message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/support?id=${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage }),
      });
      const json = await res.json();
      if (json.ok) {
        setReplyMessage('');
        loadTicket(selectedTicket.id);
        toast({ type: 'success', message: 'Reply sent' });
      } else {
        toast({ type: 'error', message: json.error?.message || 'Failed' });
      }
    } catch (e: any) {
      toast({ type: 'error', message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'new') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Card variant="glass" padding="md">
          <h2 className="text-lg font-black text-text mb-4">Create ticket</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 200))}
                placeholder="Brief summary"
                className="w-full h-11 px-3 rounded-xl bg-bg-elevated border border-edge text-sm text-text focus:border-brand-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={cn(
                      'h-10 px-3 rounded-xl text-xs font-bold transition-all',
                      category === c.key
                        ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white'
                        : 'bg-surface-light text-text-secondary hover:bg-surface',
                    )}
                  >
                    {c.de}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                rows={6}
                placeholder="Describe your issue in detail..."
                className="w-full p-3 rounded-xl bg-bg-elevated border border-edge text-sm text-text placeholder:text-text-muted focus:border-brand-red-500 focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={() => setView('list')}>Cancel</Button>
              <Button variant="primary" fullWidth onClick={handleCreate} loading={submitting}>Submit</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (view === 'detail' && selectedTicket) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => { setView('list'); setSelectedTicket(null); }}>
          ← Back
        </Button>
        <Card variant="glass" padding="md">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h2 className="text-base font-black text-text">{selectedTicket.subject}</h2>
            <span className={cn('h-6 px-2 inline-flex items-center rounded-full text-2xs font-bold border', STATUS_MAP[selectedTicket.status]?.color)}>
              {STATUS_MAP[selectedTicket.status]?.de}
            </span>
          </div>
          <p className="text-sm text-text whitespace-pre-wrap">{selectedTicket.message}</p>
          <div className="text-2xs text-text-muted mt-2">
            {new Date(selectedTicket.created_at).toLocaleString()}
          </div>
        </Card>

        {replies.length > 0 && (
          <div className="space-y-2">
            {replies.map((r) => {
              const isAdmin = r.users?.role === 'admin' || r.users?.role === 'super_admin';
              return (
                <Card
                  key={r.id}
                  variant="glass"
                  padding="sm"
                  className={isAdmin ? 'border-brand-red-500/30' : ''}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-text">{r.users?.name ?? 'User'}</span>
                    {isAdmin && <span className="text-2xs px-1.5 py-0.5 rounded bg-brand-red-500/15 text-brand-red-500 font-bold">SUPPORT</span>}
                    <span className="text-2xs text-text-muted ms-auto">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-text whitespace-pre-wrap">{r.message}</p>
                </Card>
              );
            })}
          </div>
        )}

        {selectedTicket.status !== 'closed' && (
          <Card variant="glass" padding="md">
            <textarea
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              rows={3}
              placeholder="Type your reply..."
              className="w-full p-3 rounded-xl bg-bg-elevated border border-edge text-sm text-text placeholder:text-text-muted focus:border-brand-red-500 focus:outline-none resize-none mb-2"
            />
            <Button variant="primary" size="sm" onClick={handleReply} loading={submitting} icon={<Send className="w-3.5 h-3.5" />}>
              Send
            </Button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-text">Support</h1>
        <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setView('new')}>
          New ticket
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-bg-elevated animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="MessageCircle"
          title="No tickets"
          description="Create a ticket to get help from our support team"
        />
      ) : (
        tickets.map((ticket) => (
          <Card
            key={ticket.id}
            variant="glass"
            padding="md"
            hover
            press
            onClick={() => { setSelectedTicket(ticket); setView('detail'); loadTicket(ticket.id); }}
            className="cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-text-muted flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-text truncate">{ticket.subject}</h3>
                  <span className={cn('h-5 px-2 inline-flex items-center rounded-full text-2xs font-bold border flex-shrink-0', STATUS_MAP[ticket.status]?.color)}>
                    {STATUS_MAP[ticket.status]?.de}
                  </span>
                </div>
                <p className="text-xs text-text-muted line-clamp-1">{ticket.message}</p>
                <div className="flex items-center gap-2 mt-1.5 text-2xs text-text-muted">
                  <span>{CATEGORIES.find((c) => c.key === ticket.category)?.de ?? ticket.category}</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
