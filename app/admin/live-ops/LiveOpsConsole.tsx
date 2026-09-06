'use client';

/**
 * LiveOpsConsole — Admin Live Operations dashboard UI
 *
 * EXACT VISUAL (v4) — matches the reference image exactly.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { UserAvatar } from '@/components/customer/UserAvatar';
import Menu from 'lucide-react/dist/esm/icons/menu.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import Bell from 'lucide-react/dist/esm/icons/bell.js';
import Receipt from 'lucide-react/dist/esm/icons/receipt.js';
import Settings from 'lucide-react/dist/esm/icons/settings.js';
import MapPin from 'lucide-react/dist/esm/icons/map-pin.js';
import Users from 'lucide-react/dist/esm/icons/users.js';
import Map from 'lucide-react/dist/esm/icons/map.js';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle.js';
import BarChart3 from 'lucide-react/dist/esm/icons/bar-chart-3.js';
import FileText from 'lucide-react/dist/esm/icons/file-text.js';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag.js';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard.js';
import Clock from 'lucide-react/dist/esm/icons/clock.js';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up.js';
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up.js';
import ArrowDown from 'lucide-react/dist/esm/icons/arrow-down.js';
import Calendar from 'lucide-react/dist/esm/icons/calendar.js';
import Download from 'lucide-react/dist/esm/icons/download.js';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus.js';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface LiveOpsConsoleProps {
  kpis: {
    activeOrders: number;
    activeDelta: number;
    driversOnline: number;
    driverDelta: number;
    avgEta: number;
    avgEtaDelta: number;
    revenueToday: number;
    revenueDelta: number;
  };
  liveFeed: Array<{
    id: string;
    orderNumber: string;
    status: string;
    etaMinutes: number;
    total: number;
    restaurantName?: string;
    district?: string;
    driverName?: string;
    driverId?: string;
  }>;
  driverMarkers: Array<{ id: string; name: string; lat: number; lng: number }>;
  restaurantMarkers: Array<{ id: string; name: string; lat: number; lng: number }>;
  userName: string;
  userAvatar: string | null;
  canViewPaymentOperations: boolean;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending:    { label: 'PENDING',    className: 'badge-picking' },
  confirmed:  { label: 'ASSIGNED',   className: 'badge-assigned' },
  assigned:   { label: 'ASSIGNED',   className: 'badge-assigned' },
  preparing:  { label: 'PREPARING',  className: 'badge-picking' },
  ready:      { label: 'PICKING UP', className: 'badge-picking' },
  picked_up:  { label: 'PICKING UP', className: 'badge-picking' },
  delivering: { label: 'ON THE WAY', className: 'badge-on-the-way' },
  in_transit: { label: 'ON THE WAY', className: 'badge-on-the-way' },
  arriving:   { label: 'ON THE WAY', className: 'badge-on-the-way' },
  delivered:  { label: 'DELIVERED',  className: 'badge-delivered' },
  cancelled:  { label: 'CANCELLED',  className: 'badge-picking' },
};

const NAV_ITEMS = [
  { key: 'overview',     label: 'Overview',     href: '/admin',           icon: LayoutDashboard },
  { key: 'live-ops',     label: 'Live Ops',     href: '/admin/live-ops',  icon: Map },
  { key: 'orders',       label: 'Orders',       href: '/admin/orders',    icon: ShoppingBag },
  { key: 'drivers',      label: 'Drivers',      href: '/admin/drivers',   icon: Users },
  { key: 'map',          label: 'Map',          href: '/admin/map',       icon: MapPin },
  { key: 'incidents',    label: 'Incidents',    href: '/admin/recovery-queue', icon: AlertTriangle },
  { key: 'analytics',    label: 'Analytics',    href: '/admin/analytics', icon: BarChart3 },
  { key: 'reports',      label: 'Reports',      href: '/admin/analytics', icon: FileText },
  { key: 'settings',     label: 'Settings',     href: '/admin/configuration', icon: Settings },
];

const TIME_RANGES = ['15m', '1h', '4h', '1d', '1w', 'Custom'];

export function LiveOpsConsole({
  kpis,
  liveFeed,
  driverMarkers,
  restaurantMarkers,
  userName,
  userAvatar,
  canViewPaymentOperations,
}: LiveOpsConsoleProps) {
  const { t } = useI18n();
  const pathname = usePathname() || '';
  const [activeTime, setActiveTime] = useState('15m');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  function exportLiveOrders() {
    const header = ['Order ID', 'Status', 'Driver', 'ETA minutes', 'District', 'Total EUR'];
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = liveFeed.map((order) => [order.orderNumber, order.status, order.driverName || '', order.etaMinutes, order.district || '', order.total.toFixed(2)]);
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `blinkgo-live-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportMessage(`${liveFeed.length} live orders exported.`);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-primary flex overflow-x-hidden">
      {mobileMenuOpen && (
        <button type="button" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
      )}
      {/* Left sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 bg-canvas border-e border-[var(--border)] flex-col py-4">
        <div className="px-4 mb-4">
          <BlinkLogo variant="horizontal" size="sm" priority />
        </div>
        <nav className="flex-1 px-2" aria-label="Admin navigation">
          <ul className="space-y-0.5">
            {NAV_ITEMS.filter((item) => item.key !== 'incidents' || canViewPaymentOperations).map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex flex-col items-center lg:flex-row lg:items-center lg:gap-2.5 px-2 py-2.5 rounded-lg text-[12px] font-semibold transition-colors',
                      'lg:px-3 lg:py-2.5 lg:text-[13px]',
                      active
                        ? 'bg-brand/15 text-brand border border-brand/35'
                        : 'text-text-secondary hover:bg-surface-1 hover:text-ink-primary'
                    )}
                  >
                    <Icon className="w-5 h-5 lg:w-4 lg:h-4 shrink-0" strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <aside aria-label="Admin mobile navigation" aria-hidden={!mobileMenuOpen} className={cn('fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-[var(--border)] bg-canvas py-4 shadow-2xl transition-transform lg:hidden', mobileMenuOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full')}>
        <div className="mb-4 flex items-center justify-between px-4">
          <BlinkLogo variant="horizontal" size="sm" priority />
          <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-surface-1">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 px-3" aria-label="Admin mobile links">
          <ul className="space-y-1">
            {NAV_ITEMS.filter((item) => item.key !== 'incidents' || canViewPaymentOperations).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return <li key={item.key}><Link href={item.href} onClick={() => setMobileMenuOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold', active ? 'border border-brand/35 bg-brand/15 text-brand' : 'text-text-secondary hover:bg-surface-1 hover:text-ink-primary')}><Icon className="h-5 w-5" aria-hidden />{item.label}</Link></li>;
            })}
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top app bar */}
        <header className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-3 px-4 h-14">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-1 text-ink-primary"
              >
                <Menu className="w-5 h-5" strokeWidth={2} aria-hidden />
              </button>
              <Link href="/admin/live-ops" aria-label="BlinkGo admin home">
                <BlinkLogo variant="horizontal" size="sm" priority />
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link
                href="/admin/orders"
                aria-label="Search orders"
                className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full hover:bg-surface-1 text-ink-primary"
              >
                <Search className="w-5 h-5" strokeWidth={1.8} aria-hidden />
              </Link>
              <Link
                href="/admin/notifications"
                aria-label="Notifications"
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-1 text-ink-primary"
              >
                <Bell className="w-5 h-5" strokeWidth={1.8} aria-hidden />
                <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-brand text-white text-[10px] font-bold tabular-nums leading-none shadow-[0_0_0_2px_var(--canvas)]">
                  3
                </span>
              </Link>
              <Link
                href="/admin/orders"
                aria-label="Orders"
                className="hidden md:flex w-9 h-9 items-center justify-center rounded-full hover:bg-surface-1 text-ink-primary"
              >
                <Receipt className="w-5 h-5" strokeWidth={1.8} aria-hidden />
              </Link>
              <Link
                href="/admin/configuration"
                aria-label="Settings"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-1 text-ink-primary"
              >
                <Settings className="w-5 h-5" strokeWidth={1.8} aria-hidden />
              </Link>
              <div className="hidden sm:block w-px h-6 bg-[var(--border)] mx-1" aria-hidden />
              <Link
                href="/admin/configuration"
                aria-label="Open user settings"
                className="flex items-center gap-2 ps-1 pe-2 h-9 rounded-full hover:bg-surface-1 transition-colors"
              >
                <UserAvatar
                  name={userName}
                  email={null}
                  avatarUrl={userAvatar}
                  size={28}
                />
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 px-4 sm:px-6 py-5 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* Page title */}
          <div>
            <h1 className="text-ink-primary text-[26px] font-extrabold tracking-tight">
              {t.admin?.liveOps || 'Live Operations'}
            </h1>
            <p className="text-text-secondary text-[14px] mt-1">
              {t.admin?.liveOpsSub || 'Real-time overview of orders, drivers and performance.'}
            </p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label={t.admin?.activeOrders || 'Active orders'}
              value={kpis.activeOrders.toString()}
              delta={kpis.activeDelta}
              unit=""
              icon={ShoppingBag}
            />
            <KpiCard
              label={t.admin?.driversOnline || 'Drivers online'}
              value={kpis.driversOnline.toString()}
              delta={kpis.driverDelta}
              unit=""
              icon={Users}
            />
            <KpiCard
              label={t.admin?.avgEta || 'Avg ETA'}
              value={`${kpis.avgEta}`}
              delta={kpis.avgEtaDelta}
              unit="min"
              icon={Clock}
              deltaInverse
            />
            <KpiCard
              label={t.admin?.revenueToday || 'Revenue today'}
              value={`€${kpis.revenueToday.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              delta={kpis.revenueDelta}
              unit="%"
              icon={TrendingUp}
              isPercent
            />
          </div>

          {/* Map + Live feed */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            {/* Map */}
            <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-surface-2 aspect-[4/3] lg:aspect-auto lg:min-h-[480px]">
              {/* Keyless operational base map; live BlinkGo markers stay above it. */}
              <iframe
                title="Live operations map — Wesseling"
                src="https://www.openstreetmap.org/export/embed.html?bbox=6.9456%2C50.8008%2C7.0256%2C50.8408&layer=mapnik&marker=50.8208%2C6.9856"
                className="absolute inset-0 h-full w-full"
                style={{ filter: 'invert(0.92) hue-rotate(180deg) saturate(0.7) brightness(0.78)' }}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />

              {/* Current operations area */}
              <div className="absolute top-3 left-3 z-10">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-canvas/90 px-3 text-[13px] font-semibold text-ink-primary backdrop-blur-md">
                  <MapPin className="h-4 w-4 text-brand" aria-hidden />
                  <span>Wesseling</span>
                </div>
              </div>

              <Link href="/admin/map" aria-label="Open full operations map" className="absolute right-3 top-3 z-10 flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-canvas/90 px-3 text-xs font-bold text-ink-primary backdrop-blur-md hover:bg-canvas">
                <Map className="h-4 w-4" aria-hidden /> Full map
              </Link>

              {/* Overlay markers */}
              {restaurantMarkers.slice(0, 8).map((m, i) => {
                const positions = [
                  { left: '24%', top: '28%' },
                  { left: '48%', top: '32%' },
                  { left: '72%', top: '38%' },
                  { left: '32%', top: '52%' },
                  { left: '60%', top: '60%' },
                  { left: '42%', top: '78%' },
                  { left: '76%', top: '70%' },
                  { left: '18%', top: '68%' },
                ];
                const pos = positions[i % positions.length];
                return (
                  <div
                    key={m.id}
                    className="absolute z-10"
                    style={{ left: pos.left, top: pos.top }}
                    title={m.name}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-black/50 ring-2 ring-white">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden>
                          <path d="M3 2v7c0 1.7 1.3 3 3 3s3-1.3 3-3V2M7 2v20M21 15V2a5 5 0 0 0-3 5v6c0 1.1.9 2 2 2h1zM21 15v7" />
                        </svg>
                      </div>
                      <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-canvas text-ink-primary text-[10px] font-bold tabular-nums flex items-center justify-center ring-1 ring-[var(--border)]">
                        {i + 1}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Driver markers (car/scooter icons) */}
              {driverMarkers.slice(0, 6).map((m, i) => {
                const positions = [
                  { left: '38%', top: '44%' },
                  { left: '55%', top: '50%' },
                  { left: '20%', top: '50%' },
                  { left: '70%', top: '60%' },
                  { left: '45%', top: '72%' },
                  { left: '28%', top: '40%' },
                ];
                const pos = positions[i % positions.length];
                return (
                  <div
                    key={m.id}
                    className="absolute z-10"
                    style={{ left: pos.left, top: pos.top }}
                    title={m.name}
                  >
                    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-black/50 ring-2 ring-canvas">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
                        <circle cx="6" cy="17" r="3" />
                        <circle cx="18" cy="17" r="3" />
                        <path d="M9 17h6l-2-7h-3" />
                      </svg>
                    </div>
                  </div>
                );
              })}

              {/* Center pin (user location) */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="w-3 h-3 rounded-full bg-blue-400 ring-4 ring-blue-400/30" />
              </div>
            </div>

            {/* Live order feed */}
            <div className="rounded-2xl bg-surface-1 border border-[var(--border)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h2 className="text-ink-primary font-extrabold text-[15px]">
                  {t.admin?.liveOrderFeed || 'Live order feed'}
                </h2>
                <Link
                  href="/admin/orders"
                  className="text-brand text-[12px] font-semibold hover:underline"
                >
                  {t.common?.viewAll || 'View all'}
                </Link>
              </div>

              {liveFeed.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
                    <ShoppingBag className="w-5 h-5 text-text-muted" strokeWidth={1.5} aria-hidden />
                  </div>
                  <p className="text-ink-primary font-semibold text-[14px]">
                    {t.admin?.noActiveOrders || 'No active orders right now'}
                  </p>
                  <p className="text-text-secondary text-[12px] mt-1">
                    {t.admin?.noActiveOrdersSub || 'New orders will appear here in real time.'}
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-text-muted text-[11px] uppercase tracking-wider">
                        <th className="text-start font-semibold px-3 py-2">Order ID</th>
                        <th className="text-start font-semibold px-3 py-2">Status</th>
                        <th className="text-start font-semibold px-3 py-2">Driver</th>
                        <th className="text-start font-semibold px-3 py-2">ETA</th>
                        <th className="text-start font-semibold px-3 py-2">District</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveFeed.map((o) => {
                        const status = STATUS_META[o.status] || STATUS_META.pending;
                        return (
                          <tr
                            key={o.id}
                            className="border-t border-[var(--border)] hover:bg-surface-2 transition-colors"
                          >
                            <td className="px-3 py-2.5 text-ink-primary font-semibold tabular-nums">
                              {o.orderNumber}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn('inline-flex items-center px-2 h-5 rounded-md text-[10px] font-bold uppercase tracking-wider', status.className)}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary tabular-nums">
                              {o.driverName || <span className="text-text-muted">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-ink-primary tabular-nums">
                              {o.etaMinutes > 0 ? `${o.etaMinutes} min` : <span className="text-text-muted">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {o.district || <span className="text-text-muted">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {/* Time range controls */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-1 border border-[var(--border)]">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveTime(r)}
                  className={cn(
                    'h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors',
                    activeTime === r
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-secondary hover:text-ink-primary'
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                aria-label="Custom date"
                onClick={() => setActiveTime('Custom')}
                className={cn(
                  'h-8 w-9 flex items-center justify-center rounded-lg transition-colors',
                  activeTime === 'Custom'
                    ? 'bg-brand text-white'
                    : 'text-text-secondary hover:text-ink-primary'
                )}
              >
                <Calendar className="w-4 h-4" strokeWidth={1.8} aria-hidden />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Link
                href="/admin/orders"
                className="flex flex-1 sm:flex-none items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-[13px] font-bold hover:bg-brand-hover active:scale-95 transition-all shadow-sm"
              >
                <UserPlus className="w-4 h-4" strokeWidth={2} aria-hidden />
                {t.admin?.assignDriver || 'Assign driver'}
              </Link>
              <button
                type="button"
                onClick={exportLiveOrders}
                className="flex flex-1 sm:flex-none items-center justify-center gap-2 h-10 px-4 rounded-xl bg-surface-1 text-ink-primary text-[13px] font-bold hover:bg-surface-2 active:scale-95 transition-all border border-[var(--border)]"
              >
                <Download className="w-4 h-4" strokeWidth={2} aria-hidden />
                {t.admin?.export || 'Export'}
              </button>
              {canViewPaymentOperations && (
                <Link
                  href="/admin/recovery-queue"
                  className="flex flex-[1_1_100%] sm:flex-none items-center justify-center gap-2 h-10 px-4 rounded-xl bg-surface-1 text-ink-primary text-[13px] font-bold hover:bg-surface-2 active:scale-95 transition-all border border-[var(--border)]"
                >
                  <FileText className="w-4 h-4" strokeWidth={2} aria-hidden />
                  {t.admin?.viewIncidentLog || 'View incident log'}
                </Link>
              )}
            </div>
            <p className="sr-only" aria-live="polite">{exportMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  delta: number;
  unit: string;
  icon: typeof ShoppingBag;
  isPercent?: boolean;
  deltaInverse?: boolean;
}

function KpiCard({ label, value, delta, unit, icon: Icon, isPercent, deltaInverse }: KpiCardProps) {
  const positive = delta > 0;
  const negative = delta < 0;
  const goodDirection = deltaInverse ? negative : positive;
  return (
    <div className="rounded-2xl bg-surface-1 border border-[var(--border)] p-4 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-text-secondary text-[12px] font-medium">{label}</p>
        <p className="text-ink-primary text-[28px] font-extrabold leading-none mt-1.5 tabular-nums">
          {value}
          {unit && <span className="text-text-secondary text-[16px] font-bold ms-1">{unit}</span>}
        </p>
        <p
          className={cn(
            'text-[11px] font-semibold mt-1.5 flex items-center gap-1 tabular-nums',
            goodDirection ? 'text-status-success' : (delta === 0 ? 'text-text-muted' : 'text-status-error')
          )}
        >
          {delta > 0 && <ArrowUp className="w-3 h-3" strokeWidth={2.5} aria-hidden />}
          {delta < 0 && <ArrowDown className="w-3 h-3" strokeWidth={2.5} aria-hidden />}
          <span>{Math.abs(delta)}{isPercent ? '%' : ''}</span>
          <span className="text-text-muted font-normal ms-0.5">vs last 15 min</span>
        </p>
      </div>
      <div className="shrink-0 w-12 h-12 rounded-xl bg-brand flex items-center justify-center">
        <Icon className="w-5 h-5 text-white" strokeWidth={1.8} aria-hidden />
      </div>
    </div>
  );
}
