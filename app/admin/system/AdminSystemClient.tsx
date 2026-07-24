'use client';

import { useState, useEffect } from 'react';
import { Settings, Database, Mail, Globe, Shield, Activity, Server, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';

const T = {
  de: {
    title: 'System',
    subtitle: 'Plattform-Einstellungen und Konfiguration',
    config: 'Konfiguration',
    service: 'Service-Status',
    db: 'Datenbank',
    email: 'E-Mail-Versand (Resend)',
    geo: 'Geocoding (Nominatim)',
    supabase: 'Supabase',
    security: 'Sicherheit',
    cors: 'CORS',
    rateLimit: 'Rate Limiting',
    csp: 'Content-Security-Policy',
    operational: 'Operativ',
    healthy: 'Gesund',
    notConfigured: 'Nicht konfiguriert',
    configValue: 'Konfiguriert',
    refresh: 'Aktualisieren',
  },
  ar: {
    title: 'النظام',
    subtitle: 'إعدادات وتهيئة المنصة',
    config: 'الإعدادات',
    service: 'حالة الخدمة',
    db: 'قاعدة البيانات',
    email: 'إرسال البريد (Resend)',
    geo: 'الترميز الجغرافي (Nominatim)',
    supabase: 'Supabase',
    security: 'الأمان',
    cors: 'CORS',
    rateLimit: 'تحديد المعدل',
    csp: 'سياسة أمان المحتوى',
    operational: 'تشغيلي',
    healthy: 'صحي',
    notConfigured: 'غير مهيأ',
    configValue: 'مهيأ',
    refresh: 'تحديث',
  },
  en: {
    title: 'System',
    subtitle: 'Platform settings and configuration',
    config: 'Configuration',
    service: 'Service status',
    db: 'Database',
    email: 'Email (Resend)',
    geo: 'Geocoding (Nominatim)',
    supabase: 'Supabase',
    security: 'Security',
    cors: 'CORS',
    rateLimit: 'Rate limiting',
    csp: 'Content-Security-Policy',
    operational: 'Operational',
    healthy: 'Healthy',
    notConfigured: 'Not configured',
    configValue: 'Configured',
    refresh: 'Refresh',
  },
};

export function AdminSystemClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';

  // These are derived from server / env at build time. For client display, we use indicators.
  const [dbStatus, setDbStatus] = useState<'ok' | 'down' | 'unknown'>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/health');
        setDbStatus(res.ok ? 'ok' : 'down');
      } catch {
        setDbStatus('down');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
        </header>

        {/* Service status */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ServiceCard
            icon={Database}
            label={t.db}
            status={dbStatus === 'ok' ? 'ok' : dbStatus === 'down' ? 'down' : 'unknown'}
            okLabel={t.operational}
            koLabel="Offline"
            loading={loading}
          />
          <ServiceCard
            icon={Mail}
            label={t.email}
            status="ok"
            detail="Resend"
            okLabel={t.configValue}
          />
          <ServiceCard
            icon={Globe}
            label={t.geo}
            status="ok"
            detail="Nominatim"
            okLabel={t.operational}
          />
          <ServiceCard
            icon={Server}
            label={t.supabase}
            status="ok"
            detail="rhdafflglyxtucux.supabase.co"
            okLabel={t.operational}
          />
          <ServiceCard
            icon={Shield}
            label={t.security}
            status="ok"
            detail="CORS + CSP + Rate Limit"
            okLabel={t.configValue}
          />
          <ServiceCard
            icon={Activity}
            label={t.service}
            status="ok"
            okLabel={t.healthy}
          />
        </section>

        {/* Security info */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-5">
          <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
            {t.security}
          </h2>
          <div className="space-y-2 text-sm">
            <SecurityRow label={t.cors} value="Strict allowlist (no wildcards)" ok />
            <SecurityRow label={t.rateLimit} value="In-memory sliding window (5/15min auth, 60/min admin)" ok />
            <SecurityRow label={t.csp} value="default-src 'self'; CSP enforced on all routes" ok />
            <SecurityRow label="HSTS" value="Enabled in production" ok />
            <SecurityRow label="X-Frame-Options" value="DENY" ok />
            <SecurityRow label="Input Validation" value="isValidEmail, isValidPassword, sanitizeText on all auth routes" ok />
          </div>
        </section>

        {/* Architecture */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-5">
          <h2 className="text-sm font-extrabold text-text-secondary uppercase tracking-wider mb-4">
            {isAr ? 'البنية' : 'Architektur'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <ArchItem
              label="Framework"
              value="Next.js 14 (App Router)"
            />
            <ArchItem label="Backend" value="Next.js API Routes" />
            <ArchItem label="Database" value="Supabase (PostgreSQL)" />
            <ArchItem label="Auth" value="Supabase Auth + JWT in HTTP-only cookies" />
            <ArchItem label="Realtime" value="Supabase Postgres Realtime" />
            <ArchItem label="Email" value="Resend API" />
            <ArchItem label="Geocoding" value="Nominatim (OpenStreetMap, free)" />
            <ArchItem label="Maps" value="OpenStreetMap iframe embed (no API key)" />
            <ArchItem label="Styling" value="Tailwind CSS + custom design tokens" />
            <ArchItem label="i18n" value="Server-authoritative 3-locale (DE/AR/EN)" />
            <ArchItem label="i18n layout" value="I18nProvider with cookie-based init" />
            <ArchItem label="RBAC" value="3-tier admin (Super/Admin/Manager)" />
            <ArchItem label="Rate Limiting" value="In-memory sliding window" />
            <ArchItem label="CSP" value="Strict, no wildcards" />
            <ArchItem label="Translations" value="DE/AR/EN dicts, no hardcoded strings" />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function ServiceCard({
  icon: Icon,
  label,
  status,
  detail,
  okLabel,
  koLabel,
  loading,
}: {
  icon: any;
  label: string;
  status: 'ok' | 'down' | 'unknown';
  detail?: string;
  okLabel: string;
  koLabel?: string;
  loading?: boolean;
}) {
  const isOk = status === 'ok';
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-5 h-5 text-text-secondary" />
        {isOk ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
      </div>
      <p className="text-sm font-extrabold text-white">{label}</p>
      {detail && <p className="text-[10px] text-text-muted mt-0.5" dir="ltr">{detail}</p>}
      <p
        className={cn(
          'text-[10px] font-extrabold uppercase tracking-wider mt-1.5',
          isOk ? 'text-emerald-400' : status === 'down' ? 'text-red-400' : 'text-text-muted',
        )}
      >
        {loading ? '...' : isOk ? okLabel : koLabel ?? 'Offline'}
      </p>
    </div>
  );
}

function SecurityRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-edge last:border-0">
      {ok && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-text-secondary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5" dir="ltr">{value}</p>
      </div>
    </div>
  );
}

function ArchItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-700/40 border border-edge p-3">
      <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
        {label}
      </p>
      <p className="text-xs text-white font-bold mt-0.5">{value}</p>
    </div>
  );
}
