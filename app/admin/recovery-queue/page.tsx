/**
 * Admin Manual Recovery Queue Page (Phase 7G-A)
 * ──────────────────────────────────────────────────
 * Lists payments that succeeded but couldn't be auto-converted to orders
 * (typically because the Order Draft had expired).
 *
 * Admins can:
 *   - Review pending items
 *   - Mark as refunded / order_recreated / contacted / resolved
 *   - Add resolution notes
 */
'use client';
import { useCallback, useState, useEffect } from 'react';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import { PageHeader } from '@/components/shared/PageHeader';

interface RecoveryItem {
  id: number;
  payment_intent_id: string;
  customer_id: string;
  draft_id: string;
  amount_cents: number;
  currency: string;
  reason: string;
  status: 'pending' | 'refunded' | 'order_recreated' | 'contacted' | 'resolved';
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ['pending', 'refunded', 'order_recreated', 'contacted', 'resolved'];

function apiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const value = payload as { message?: unknown; error?: unknown };
  if (typeof value.message === 'string') return value.message;
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error === 'object' && typeof (value.error as { message?: unknown }).message === 'string') {
    return (value.error as { message: string }).message;
  }
  return fallback;
}

export default function RecoveryQueuePage() {
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('pending');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/recovery-queue?status=${encodeURIComponent(filter)}`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(apiError(json, 'Failed to load'));
        setItems([]);
      } else {
        setItems(json.data?.items ?? json.items ?? []);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (authorized !== true) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadItems(); });
    return () => { cancelled = true; };
  }, [authorized, loadItems]);

  async function saveItem(id: number) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/recovery-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: editStatus, resolution_notes: editNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(apiError(json, 'Update failed'));
        return;
      }
      setEditingId(null);
      setEditStatus('');
      setEditNotes('');
      await loadItems();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const data = payload?.data ?? payload;
        const role = data?.profile?.role;
        const permissions = Array.isArray(data?.user?.permissions) ? data.user.permissions : [];
        setAuthorized(role === 'super_admin' || permissions.includes('payment_support'));
      })
      .catch(() => { if (!cancelled) setAuthorized(false); });
    return () => { cancelled = true; };
  }, []);

  if (authorized === null) {
    return <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="size-6 animate-spin text-brand-red" /><span className="sr-only">Checking permissions</span></div>;
  }
  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title="Manual Recovery Queue" subtitle="Restricted payment operations" back />
        <div role="alert" className="rounded-3xl border border-brand-yellow/30 bg-brand-yellow/10 p-6">
          <h1 className="text-xl font-black text-white">Additional permission required</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">This queue contains sensitive payment recovery data. Ask a super admin to grant the payment_support permission.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <PageHeader
        title="Manual Recovery Queue"
        subtitle="Payments that succeeded but could not create orders automatically"
        back
      />

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 h-9 rounded-xl text-sm font-medium border transition-colors ${
              filter === s
                ? 'bg-brand-red text-white border-brand-red'
                : 'bg-surface-elevated text-text-secondary border-edge hover:border-text-muted'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => void loadItems()}
          disabled={loading}
          className="ml-auto px-3 h-9 rounded-xl text-sm font-medium bg-surface-elevated text-text-secondary border border-edge hover:border-text-muted flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-edge bg-surface-elevated p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
          <p className="text-text-secondary text-sm">No items with status {'"'}{filter}{'"'}.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-edge bg-surface-elevated overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface/50 text-text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3">PaymentIntent</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-edge">
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {item.payment_intent_id}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                    {item.customer_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {((item.amount_cents ?? 0) / 100).toFixed(2)} {item.currency}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {item.reason}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                      item.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="bg-surface border border-edge rounded px-2 py-1 text-xs"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Notes"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="bg-surface border border-edge rounded px-2 py-1 text-xs w-32"
                        />
                        <button
                          onClick={() => void saveItem(item.id)}
                          disabled={saving}
                          className="px-2 py-1 rounded bg-brand-red text-white text-xs font-bold disabled:opacity-50"
                        >
                          {saving ? '…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditStatus(''); setEditNotes(''); }}
                          className="px-2 py-1 rounded bg-surface text-text-secondary text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(item.id); setEditStatus(item.status); setEditNotes(item.resolution_notes ?? ''); }}
                        className="text-xs text-brand-red hover:underline"
                      >
                        Update
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
