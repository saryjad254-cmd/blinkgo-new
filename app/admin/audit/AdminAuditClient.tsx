'use client';

import { useState, useEffect } from 'react';
import { Database, Activity, Mail, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'Audit-Log',
    subtitle: 'System-Aktivitäten und Sicherheitsereignisse',
    type: 'Typ',
    description: 'Beschreibung',
    actor: 'Akteur',
    time: 'Zeit',
    details: 'Details',
    refresh: 'Aktualisieren',
    login: 'Anmeldung',
    logout: 'Abmeldung',
    register: 'Registrierung',
    rateLimited: 'Rate-Limit ausgelöst',
    roleChange: 'Rollenänderung',
    passwordReset: 'Passwort zurücksetzen',
    blocked: 'Benutzer gesperrt',
    deleted: 'Benutzer gelöscht',
    noEvents: 'Keine Ereignisse',
  },
  ar: {
    title: 'سجل التدقيق',
    subtitle: 'أنشطة النظام وأحداث الأمان',
    type: 'النوع',
    description: 'الوصف',
    actor: 'الفاعل',
    time: 'الوقت',
    details: 'التفاصيل',
    refresh: 'تحديث',
    login: 'تسجيل دخول',
    logout: 'تسجيل خروج',
    register: 'تسجيل',
    rateLimited: 'تم تفعيل تحديد المعدل',
    roleChange: 'تغيير الدور',
    passwordReset: 'إعادة تعيين كلمة المرور',
    blocked: 'تم حظر المستخدم',
    deleted: 'تم حذف المستخدم',
    noEvents: 'لا توجد أحداث',
  },
  en: {
    title: 'Audit log',
    subtitle: 'System activities and security events',
    type: 'Type',
    description: 'Description',
    actor: 'Actor',
    time: 'Time',
    details: 'Details',
    refresh: 'Refresh',
    login: 'Login',
    logout: 'Logout',
    register: 'Register',
    rateLimited: 'Rate-limited',
    roleChange: 'Role change',
    passwordReset: 'Password reset',
    blocked: 'User blocked',
    deleted: 'User deleted',
    noEvents: 'No events',
  },
};

const EVENT_ICONS: Record<string, any> = {
  login: Activity,
  logout: Activity,
  register: Mail,
  rate_limited: AlertCircle,
  role_change: Shield,
  password_reset: Shield,
  blocked: Shield,
  deleted: Shield,
};

const EVENT_COLORS: Record<string, string> = {
  login: 'bg-emerald-500/15 text-emerald-400',
  logout: 'bg-ink-700 text-text-muted',
  register: 'bg-cyan-500/15 text-cyan-400',
  rate_limited: 'bg-warning/15 text-warning',
  role_change: 'bg-violet-500/15 text-violet-400',
  password_reset: 'bg-blue-500/15 text-blue-400',
  blocked: 'bg-red-500/15 text-red-400',
  deleted: 'bg-red-500/15 text-red-400',
};

export function AdminAuditClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/audit');
      const data = await res.json();
      if (res.ok && data.ok) setEvents(data.events);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

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
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-700 border border-edge text-sm font-bold text-text-secondary hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t.refresh}
          </button>
        </header>

        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : events.length === 0 ? (
            <p className="p-12 text-center text-text-muted text-sm">{t.noEvents}</p>
          ) : (
            <div className="divide-y divide-edge">
              {events.map((e) => {
                const Icon = EVENT_ICONS[e.type] ?? Database;
                return (
                  <div key={e.id} className="flex items-start gap-3 p-4">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                        EVENT_COLORS[e.type] ?? 'bg-ink-700 text-text-muted',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-white">
                          {((t as any)[e.type] as string) ?? e.type}
                        </span>
                        {e.actor && (
                          <span className="text-xs text-text-muted" dir="ltr">
                            {e.actor}
                          </span>
                        )}
                      </div>
                      {e.description && (
                        <p className="text-xs text-text-secondary mt-0.5">{e.description}</p>
                      )}
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {new Date(e.created_at).toLocaleString(
                          locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
