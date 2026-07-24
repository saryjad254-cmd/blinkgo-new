'use client';

import { useState } from 'react';
import { MessageCircle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category: string;
  user_role: string;
  created_at: string;
  updated_at: string;
  users?: { name: string; email: string; role: string };
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
  const [filter, setFilter] = useState<string>('all');
  const [tickets] = useState(initialTickets);

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    waiting_user: tickets.filter((t) => t.status === 'waiting_user').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-text">Support Tickets</h1>
        <p className="text-sm text-text-muted mt-1">{tickets.length} total · {counts.open} open</p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'open', 'in_progress', 'waiting_user', 'resolved'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 h-9 rounded-full text-xs font-bold transition-all ${
              filter === s ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white' : 'bg-bg-elevated text-text-secondary hover:bg-surface-light'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')} ({counts[s as keyof typeof counts] ?? 0})
          </button>
        ))}
      </div>

      {/* Tickets list */}
      {filtered.length === 0 ? (
        <Card variant="glass" padding="lg">
          <p className="text-center text-text-muted">No tickets found</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Card key={t.id} variant="glass" padding="md" hover>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-bg-light flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-bold text-text">{t.subject}</h3>
                    <span className={`h-5 px-2 inline-flex items-center rounded-full text-2xs font-bold ${STATUS_COLORS[t.status]}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                    {t.priority === 'urgent' && (
                      <span className={`inline-flex items-center gap-1 text-2xs font-bold ${PRIORITY_COLORS[t.priority]}`}>
                        <AlertCircle className="w-3 h-3" />
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted line-clamp-1">{t.message}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-2xs text-text-muted">
                    <span>{t.users?.name ?? 'Unknown'} · {t.users?.email}</span>
                    <span>·</span>
                    <span>{t.category}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{new Date(t.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
