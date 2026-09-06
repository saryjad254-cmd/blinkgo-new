'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bell, CheckCircle2, CreditCard, Home, Mail, Map, Phone,
  Search, Settings, ShieldCheck, ShoppingBag, Store, Truck, UserRound, Users,
  XCircle,
} from 'lucide-react';
import { PortalShell, type NavItem } from '@/components/portal/PortalShell';
import { EmptyState, KpiTile, PageHeader, PortalCard, StatusPill } from '@/components/portal/PortalPrimitives';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

interface UserRecord {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  created_at?: string | null;
  last_sign_in_at?: string | null;
}

interface UserStats { total: number; active: number; verified: number; byRole: Record<string, number> }

const COPY = {
  de: { overview: 'Übersicht', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Bestellungen', management: 'Management', customers: 'Kunden', drivers: 'Fahrer', restaurants: 'Restaurants', zones: 'Lieferzonen', business: 'Business', finance: 'Finanzen', analytics: 'Analytics', system: 'System', notifications: 'Benachrichtigungen', configuration: 'Konfiguration', title: 'Benutzer', subtitle: 'Konten, Rollen, Verifizierung und Zugriff verwalten.', total: 'Gesamt', active: 'Aktiv', verified: 'Verifiziert', inactive: 'Deaktiviert', all: 'Alle', staff: 'Team', search: 'Nach Name, E-Mail oder Telefon suchen…', empty: 'Keine Benutzer gefunden', emptyBody: 'Passen Sie Suche oder Filter an.', user: 'Benutzer', contact: 'Kontakt', role: 'Rolle', status: 'Status', created: 'Erstellt', customer: 'Kunde', driver: 'Fahrer', restaurant: 'Restaurant', admin: 'Admin', super_admin: 'Super-Admin', manager: 'Manager', unknown: 'Unbekannt', notVerified: 'Nicht verifiziert', yourAccount: 'Ihr Konto', protectedAccount: 'Geschützt', suspend: 'Deaktivieren', activate: 'Aktivieren', confirmSuspend: 'Dieses Benutzerkonto wirklich deaktivieren? Die Anmeldung wird sofort gesperrt.', confirmActivate: 'Dieses Benutzerkonto wieder aktivieren?', suspended: 'Benutzerkonto wurde deaktiviert.', activated: 'Benutzerkonto wurde aktiviert.', actionFailed: 'Aktion fehlgeschlagen. Bitte erneut versuchen.', processing: 'Wird gespeichert…' },
  ar: { overview: 'نظرة عامة', dashboard: 'لوحة التحكم', controlCenter: 'مركز التحكم', orders: 'الطلبات', management: 'الإدارة', customers: 'الزبائن', drivers: 'السائقون', restaurants: 'المطاعم', zones: 'مناطق التوصيل', business: 'الأعمال', finance: 'المالية', analytics: 'التحليلات', system: 'النظام', notifications: 'الإشعارات', configuration: 'الإعدادات', title: 'المستخدمون', subtitle: 'إدارة الحسابات والأدوار والتوثيق وصلاحية الدخول.', total: 'الإجمالي', active: 'نشط', verified: 'موثّق', inactive: 'موقوف', all: 'الكل', staff: 'فريق الإدارة', search: 'ابحث بالاسم أو البريد أو الهاتف…', empty: 'لم يتم العثور على مستخدمين', emptyBody: 'غيّر عبارة البحث أو عامل التصفية.', user: 'المستخدم', contact: 'التواصل', role: 'الدور', status: 'الحالة', created: 'تاريخ الإنشاء', customer: 'زبون', driver: 'سائق', restaurant: 'مطعم', admin: 'مدير', super_admin: 'مدير عام', manager: 'مشرف', unknown: 'غير معروف', notVerified: 'غير موثّق', yourAccount: 'حسابك الحالي', protectedAccount: 'حساب محمي', suspend: 'إيقاف الحساب', activate: 'إعادة التفعيل', confirmSuspend: 'هل تريد إيقاف هذا الحساب؟ سيتم منع تسجيل الدخول فورًا.', confirmActivate: 'هل تريد إعادة تفعيل هذا الحساب؟', suspended: 'تم إيقاف حساب المستخدم.', activated: 'تم تفعيل حساب المستخدم.', actionFailed: 'تعذر تنفيذ العملية. حاول مجددًا.', processing: 'جارٍ الحفظ…' },
  en: { overview: 'Overview', dashboard: 'Dashboard', controlCenter: 'Control Center', orders: 'Orders', management: 'Management', customers: 'Customers', drivers: 'Drivers', restaurants: 'Restaurants', zones: 'Delivery zones', business: 'Business', finance: 'Finance', analytics: 'Analytics', system: 'System', notifications: 'Notifications', configuration: 'Configuration', title: 'Users', subtitle: 'Manage accounts, roles, verification, and access.', total: 'Total', active: 'Active', verified: 'Verified', inactive: 'Suspended', all: 'All', staff: 'Staff', search: 'Search by name, email, or phone…', empty: 'No users found', emptyBody: 'Adjust your search or filter.', user: 'User', contact: 'Contact', role: 'Role', status: 'Status', created: 'Created', customer: 'Customer', driver: 'Driver', restaurant: 'Restaurant', admin: 'Admin', super_admin: 'Super admin', manager: 'Manager', unknown: 'Unknown', notVerified: 'Not verified', yourAccount: 'Your account', protectedAccount: 'Protected', suspend: 'Suspend', activate: 'Reactivate', confirmSuspend: 'Suspend this user account? Sign-in will be blocked immediately.', confirmActivate: 'Reactivate this user account?', suspended: 'User account suspended.', activated: 'User account activated.', actionFailed: 'The action failed. Please try again.', processing: 'Saving…' },
} satisfies Record<Locale, Record<string, string>>;

function roleLabel(role: string | null | undefined, copy: typeof COPY.de) {
  return copy[(role || 'unknown') as keyof typeof copy] || role || copy.unknown;
}

function dateLabel(value: string | null | undefined, locale: Locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium' }).format(new Date(value));
}

export function AdminUsersClient({ initialUsers, stats, userName, currentUserId, currentUserRole }: { initialUsers: UserRecord[]; stats: UserStats; userName: string; currentUserId: string; currentUserRole: string }) {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = COPY[locale];
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'driver' | 'restaurant' | 'staff'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const filtered = useMemo(() => users.filter((user) => {
    if (roleFilter === 'staff' && !['admin', 'super_admin', 'manager'].includes(user.role || '')) return false;
    if (roleFilter !== 'all' && roleFilter !== 'staff' && user.role !== roleFilter) return false;
    if (search) {
      const needle = search.toLowerCase();
      if (![user.name, user.email, user.phone].some((value) => value && value.toLowerCase().includes(needle))) return false;
    }
    return true;
  }), [users, search, roleFilter]);

  const logout = useCallback(async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }, [router]);
  const navSections = useMemo<{ title: string; items: NavItem[] }[]>(() => [
    { title: copy.overview, items: [{ href: '/admin/dashboard', label: copy.dashboard, icon: Home, exact: true }, { href: '/admin/control-center', label: copy.controlCenter, icon: Activity }, { href: '/admin/orders', label: copy.orders, icon: ShoppingBag }] },
    { title: copy.management, items: [{ href: '/admin/users', label: copy.customers, icon: Users }, { href: '/admin/drivers', label: copy.drivers, icon: Truck }, { href: '/admin/restaurants', label: copy.restaurants, icon: Store }, { href: '/admin/zones', label: copy.zones, icon: Map }] },
    { title: copy.business, items: [{ href: '/admin/finance', label: copy.finance, icon: CreditCard }, { href: '/admin/analytics', label: copy.analytics, icon: BarChart3 }] },
    { title: copy.system, items: [{ href: '/admin/notifications', label: copy.notifications, icon: Bell }, { href: '/admin/configuration', label: copy.configuration, icon: Settings }] },
  ], [copy]);

  async function toggleActive(user: UserRecord) {
    const activate = user.is_active === false;
    if (!window.confirm(activate ? copy.confirmActivate : copy.confirmSuspend)) return;
    setBusyId(user.id); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/${activate ? 'unsuspend' : 'suspend'}`, { method: 'POST', headers: { 'Accept-Language': locale } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(payload, copy.actionFailed));
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, is_active: activate } : entry));
      setFeedback({ tone: 'success', text: activate ? copy.activated : copy.suspended }); router.refresh();
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : copy.actionFailed }); }
    finally { setBusyId(null); }
  }

  const currentStats = { total: users.length, active: users.filter((user) => user.is_active !== false).length, verified: users.filter((user) => user.is_verified).length };
  const roleFilters = ['all', 'customer', 'driver', 'restaurant', 'staff'] as const;

  return <PortalShell brand={{ name: 'BlinkGo Admin', tagline: copy.title, emoji: '👑' }} navSections={navSections} user={{ name: userName, email: userName, role: 'admin' }} locale={locale} onLocaleChange={setLocale} onLogout={logout}>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={copy.title} description={`${copy.subtitle} · ${filtered.length}/${currentStats.total}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={copy.total} value={currentStats.total} icon={<Users className="size-5" />} />
        <KpiTile label={copy.active} value={currentStats.active} tone="success" icon={<CheckCircle2 className="size-5" />} />
        <KpiTile label={copy.verified} value={currentStats.verified} tone="info" icon={<ShieldCheck className="size-5" />} />
        <KpiTile label={copy.inactive} value={currentStats.total - currentStats.active} tone="warning" icon={<XCircle className="size-5" />} />
      </div>

      {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-status-success/30 bg-status-success/10 text-status-success' : 'border-status-error/30 bg-status-error/10 text-status-error'}`}>{feedback.text}</div>}

      <PortalCard className="mb-4">
        <div className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="min-h-11 w-full rounded-xl border border-border bg-bg ps-10 pe-4 text-sm focus:border-brand-red focus:outline-none" /></div>
        <div className="mt-3 flex flex-wrap gap-2">{roleFilters.map((filter) => { const count = filter === 'staff' ? ['admin', 'super_admin', 'manager'].reduce((sum, role) => sum + (stats.byRole[role] || 0), 0) : filter === 'all' ? stats.total : stats.byRole[filter] || 0; return <button key={filter} type="button" onClick={() => setRoleFilter(filter)} className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${roleFilter === filter ? 'bg-brand-red text-white' : 'bg-bg text-text-secondary hover:text-text-primary'}`}>{filter === 'all' ? copy.all : filter === 'staff' ? copy.staff : roleLabel(filter, copy)} <span className="opacity-70">({count})</span></button>; })}</div>
      </PortalCard>

      {filtered.length === 0 ? <PortalCard><EmptyState icon={<Users className="size-8" />} title={copy.empty} description={copy.emptyBody} /></PortalCard> : <>
        <div className="grid grid-cols-1 gap-4 md:hidden">{filtered.map((user) => <UserCard key={user.id} user={user} copy={copy} locale={locale} currentUserId={currentUserId} currentUserRole={currentUserRole} busyId={busyId} onToggle={toggleActive} />)}</div>
        <PortalCard padding="none" className="hidden min-w-0 w-full max-w-full overflow-hidden md:block"><div className="w-full max-w-full overflow-x-auto"><table className="w-full min-w-[860px] table-fixed text-sm"><thead className="border-b border-border bg-bg text-xs text-text-muted"><tr><th className="w-[28%] p-4 text-start">{copy.user}</th><th className="w-[24%] p-4 text-start">{copy.contact}</th><th className="w-[11%] p-4 text-start">{copy.role}</th><th className="w-[15%] p-4 text-start">{copy.status}</th><th className="w-[10%] p-4 text-start">{copy.created}</th><th className="w-[12%] p-4 text-end"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((user) => <UserRow key={user.id} user={user} copy={copy} locale={locale} currentUserId={currentUserId} currentUserRole={currentUserRole} busyId={busyId} onToggle={toggleActive} />)}</tbody></table></div></PortalCard>
      </>}
    </div>
  </PortalShell>;
}

function UserIdentity({ user, copy }: { user: UserRecord; copy: typeof COPY.de }) {
  return <div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-red to-brand-yellow font-black text-white">{(user.name || user.email || '?').charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-black">{user.name || copy.user}</p><p className="truncate text-xs text-text-muted">{user.email || '—'}</p></div></div>;
}

function AccessAction({ user, copy, currentUserId, currentUserRole, busyId, onToggle }: { user: UserRecord; copy: typeof COPY.de; currentUserId: string; currentUserRole: string; busyId: string | null; onToggle: (user: UserRecord) => void }) {
  if (user.id === currentUserId) return <span className="inline-flex min-h-9 items-center rounded-xl bg-brand-yellow/10 px-3 text-xs font-bold text-brand-yellow">{copy.yourAccount}</span>;
  if (['admin', 'super_admin'].includes(user.role || '') && currentUserRole !== 'super_admin') return <span className="inline-flex min-h-9 items-center rounded-xl bg-bg px-3 text-xs font-bold text-text-muted">{copy.protectedAccount}</span>;
  const active = user.is_active !== false;
  return <button type="button" onClick={() => onToggle(user)} disabled={busyId !== null} className={`min-h-9 rounded-xl px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border border-status-error/30 text-status-error hover:bg-status-error/10' : 'bg-status-success text-white hover:bg-status-success/90'}`}>{busyId === user.id ? copy.processing : active ? copy.suspend : copy.activate}</button>;
}

function UserRow(props: { user: UserRecord; copy: typeof COPY.de; locale: Locale; currentUserId: string; currentUserRole: string; busyId: string | null; onToggle: (user: UserRecord) => void }) {
  const { user, copy, locale } = props;
  return <tr className="border-b border-border last:border-0 hover:bg-bg/40"><td className="p-4"><UserIdentity user={user} copy={copy} /></td><td className="p-4"><div className="space-y-1 text-xs">{user.email && <a href={`mailto:${user.email}`} className="flex items-center gap-1.5 hover:text-brand-red"><Mail className="size-3" />{user.email}</a>}{user.phone && <a href={`tel:${user.phone}`} dir="ltr" className="flex items-center gap-1.5 hover:text-brand-red"><Phone className="size-3" />{user.phone}</a>}</div></td><td className="p-4"><StatusPill status={user.role || 'unknown'} label={roleLabel(user.role, copy)} /></td><td className="p-4"><div className="flex flex-wrap gap-1.5"><StatusPill status={user.is_active === false ? 'inactive' : 'active'} label={user.is_active === false ? copy.inactive : copy.active} /><StatusPill status={user.is_verified ? 'approved' : 'pending_review'} label={user.is_verified ? copy.verified : copy.notVerified} /></div></td><td className="p-4 text-xs text-text-muted">{dateLabel(user.created_at, locale)}</td><td className="p-4 text-end"><AccessAction {...props} /></td></tr>;
}

function UserCard(props: { user: UserRecord; copy: typeof COPY.de; locale: Locale; currentUserId: string; currentUserRole: string; busyId: string | null; onToggle: (user: UserRecord) => void }) {
  const { user, copy, locale } = props;
  return <PortalCard><UserIdentity user={user} copy={copy} /><div className="mt-4 flex flex-wrap gap-2"><StatusPill status={user.role || 'unknown'} label={roleLabel(user.role, copy)} /><StatusPill status={user.is_active === false ? 'inactive' : 'active'} label={user.is_active === false ? copy.inactive : copy.active} /><StatusPill status={user.is_verified ? 'approved' : 'pending_review'} label={user.is_verified ? copy.verified : copy.notVerified} /></div><div className="mt-4 space-y-2 border-y border-border py-3 text-xs text-text-muted">{user.email && <a href={`mailto:${user.email}`} className="flex min-h-8 items-center gap-2"><Mail className="size-3.5" />{user.email}</a>}{user.phone && <a href={`tel:${user.phone}`} dir="ltr" className="flex min-h-8 items-center gap-2"><Phone className="size-3.5" />{user.phone}</a>}<p className="flex min-h-8 items-center gap-2"><UserRound className="size-3.5" />{copy.created}: {dateLabel(user.created_at, locale)}</p></div><div className="mt-3 flex justify-end"><AccessAction {...props} /></div></PortalCard>;
}
