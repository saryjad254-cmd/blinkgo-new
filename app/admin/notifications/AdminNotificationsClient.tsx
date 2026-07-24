'use client';

import { useState, useEffect } from 'react';
import { Bell, Send, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Benachrichtigungen',
    subtitle: 'System-Benachrichtigungen und Ankündigungen versenden',
    newNotification: 'Neue Benachrichtigung',
    title2: 'Titel',
    message: 'Nachricht',
    audience: 'Empfänger',
    type: 'Typ',
    send: 'Senden',
    cancel: 'Abbrechen',
    sent: 'Gesendet',
    recipients: 'Empfänger',
    all: 'Alle Benutzer',
    customers: 'Nur Kunden',
    drivers: 'Nur Fahrer',
    restaurants: 'Nur Restaurants',
    admins: 'Nur Admins',
    recent: 'Letzte Benachrichtigungen',
    noNotifications: 'Keine Benachrichtigungen',
  },
  ar: {
    title: 'الإشعارات',
    subtitle: 'إرسال إشعارات النظام والإعلانات',
    newNotification: 'إشعار جديد',
    title2: 'العنوان',
    message: 'الرسالة',
    audience: 'المستلمون',
    type: 'النوع',
    send: 'إرسال',
    cancel: 'إلغاء',
    sent: 'تم الإرسال',
    recipients: 'مستلم',
    all: 'جميع المستخدمين',
    customers: 'العملاء فقط',
    drivers: 'السائقون فقط',
    restaurants: 'المطاعم فقط',
    admins: 'المشرفون فقط',
    recent: 'آخر الإشعارات',
    noNotifications: 'لا توجد إشعارات',
  },
  en: {
    title: 'Notifications',
    subtitle: 'Send system notifications and announcements',
    newNotification: 'New notification',
    title2: 'Title',
    message: 'Message',
    audience: 'Audience',
    type: 'Type',
    send: 'Send',
    cancel: 'Cancel',
    sent: 'Sent',
    recipients: 'recipients',
    all: 'All users',
    customers: 'Customers only',
    drivers: 'Drivers only',
    restaurants: 'Restaurants only',
    admins: 'Admins only',
    recent: 'Recent notifications',
    noNotifications: 'No notifications',
  },
};

export function AdminNotificationsClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', audience: 'all', type: 'announcement' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent?: number; error?: string } | null>(null);

  const fetchNotifs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications');
      const data = await res.json();
      if (res.ok && data.ok) setNotifications(data.notifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error });
        return;
      }
      setResult({ ok: true, sent: data.sent });
      setForm({ title: '', message: '', audience: 'all', type: 'announcement' });
      setShowForm(false);
      fetchNotifs();
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white text-sm font-extrabold hover:opacity-90"
          >
            <Send className="w-4 h-4" />
            {t.newNotification}
          </button>
        </header>

        {result && (
          <div
            className={cn(
              'rounded-2xl p-4 flex items-center gap-3',
              result.ok
                ? 'bg-emerald-500/10 border border-emerald-500/30'
                : 'bg-red-500/10 border border-red-500/30',
            )}
          >
            {result.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <p className={cn('text-sm font-bold', result.ok ? 'text-emerald-400' : 'text-red-400')}>
              {result.ok ? `${t.sent} — ${result.sent} ${t.recipients}` : result.error}
            </p>
          </div>
        )}

        {/* Send form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
            <form
              onSubmit={handleSend}
              className="w-full max-w-md bg-surface-elevated rounded-2xl border border-edge p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-white">{t.newNotification}</h2>
                <button type="button" onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-text-secondary hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder={t.title2}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength={200}
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              />
              <textarea
                placeholder={t.message}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                maxLength={1000}
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-ink-700 border border-edge text-white placeholder:text-text-muted focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none resize-none"
              />
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                className="w-full h-11 px-4 rounded-xl bg-ink-700 border border-edge text-white focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20 focus:outline-none"
              >
                <option value="all">{t.all}</option>
                <option value="customer">{t.customers}</option>
                <option value="driver">{t.drivers}</option>
                <option value="restaurant">{t.restaurants}</option>
                <option value="admin">{t.admins}</option>
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 h-11 rounded-xl bg-ink-700 text-text-secondary font-bold">
                  {t.cancel}
                </button>
                <button type="submit" disabled={sending} className="flex-1 h-11 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white font-extrabold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" />
                  {t.send}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Recent notifications */}
        <section className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <header className="px-5 py-4 border-b border-edge">
            <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider">
              {t.recent}
            </h2>
          </header>
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : notifications.length === 0 ? (
            <p className="p-12 text-center text-text-muted text-sm">{t.noNotifications}</p>
          ) : (
            <div className="divide-y divide-edge">
              {notifications.slice(0, 50).map((n) => (
                <div key={n.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-red-500/15 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-4 h-4 text-brand-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-white truncate">{n.title}</p>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-text-muted mt-1">
                        {new Date(n.created_at).toLocaleString(
                          locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
