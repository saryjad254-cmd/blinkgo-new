/**
 * Portal Shell — shared layout for Driver / Restaurant / Admin
 * ──────────────────────────────────────────────────────────────
 * Provides:
 *   - Sidebar (collapsible on mobile)
 *   - Top bar with user menu, notifications, locale switcher
 *   - Page container
 *   - Theme support
 *
 * Replaces the 3 different per-portal layouts with one consistent shell.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Menu from 'lucide-react/dist/esm/icons/menu';
import X from 'lucide-react/dist/esm/icons/x';
import Bell from 'lucide-react/dist/esm/icons/bell';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Store from 'lucide-react/dist/esm/icons/store';
import Box from 'lucide-react/dist/esm/icons/box';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import { cn } from '@/lib/cn';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  exact?: boolean;
}

export interface PortalShellProps {
  brand: { name: string; tagline?: string; emoji?: string; image?: string };
  navSections: { title?: string; items: NavItem[] }[];
  user: { name: string; email: string; role: string };
  locale: 'de' | 'ar' | 'en';
  onLocaleChange?: (l: 'de' | 'ar' | 'en') => void;
  onLogout?: () => void;
  notificationCount?: number;
  children: React.ReactNode;
}

export function PortalShell({
  brand,
  navSections,
  user,
  locale,
  onLocaleChange,
  onLogout,
  notificationCount = 0,
  children,
}: PortalShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const labels = locale === 'ar'
    ? { openMenu: 'فتح القائمة', closeMenu: 'إغلاق القائمة', notifications: 'الإشعارات', quickCreate: 'إضافة جديدة', driver: 'إضافة سائق', restaurant: 'إضافة مطعم', product: 'إضافة منتج', zone: 'إضافة منطقة توصيل' }
    : locale === 'de'
      ? { openMenu: 'Menü öffnen', closeMenu: 'Menü schließen', notifications: 'Benachrichtigungen', quickCreate: 'Neu hinzufügen', driver: 'Fahrer hinzufügen', restaurant: 'Restaurant hinzufügen', product: 'Produkt hinzufügen', zone: 'Lieferzone hinzufügen' }
      : { openMenu: 'Open menu', closeMenu: 'Close menu', notifications: 'Notifications', quickCreate: 'Add new', driver: 'Add driver', restaurant: 'Add restaurant', product: 'Add product', zone: 'Add delivery zone' };
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const notificationHref = isAdmin ? '/admin/notifications' : user.role === 'driver' ? '/driver/notifications' : user.role === 'restaurant' ? '/restaurant/notifications' : '/notifications';
  const quickCreateItems = [
    { href: '/admin/onboarding?type=driver', label: labels.driver, icon: Truck },
    { href: '/admin/onboarding?type=restaurant', label: labels.restaurant, icon: Store },
    { href: '/admin/onboarding?type=product', label: labels.product, icon: Box },
    { href: '/admin/zones?create=1', label: labels.zone, icon: MapPin },
  ];

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // A translated-offscreen drawer is still keyboard-focusable. `inert`
  // removes it from the focus/accessibility tree while closed on mobile.
  useEffect(() => {
    if (!sidebarRef.current) return;
    sidebarRef.current.inert = isMobile && !mobileOpen;
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnTarget = mobileTriggerRef.current;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => mobileCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter((node) => !node.inert);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => returnTarget?.focus());
    };
  }, [isMobile, mobileOpen]);

  // Close menus on route change
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setMobileOpen(false);
      setUserMenuOpen(false);
      setQuickCreateOpen(false);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <div className="blinkgo-shell min-h-screen bg-bg text-text-primary" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-sticky bg-surface/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ms-2 rounded-lg p-2 hover:bg-bg"
            aria-label={labels.openMenu}
            aria-expanded={mobileOpen}
            aria-controls="portal-sidebar"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <BlinkLogo variant="horizontal" size="sm" priority />
            <span className="sr-only">{brand.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link
                href="/admin/onboarding"
                className="grid size-10 place-items-center rounded-lg bg-brand-red text-white hover:bg-brand-red-dark"
                aria-label={labels.quickCreate}
              >
                <Plus className="size-5" />
              </Link>
            )}
            <Link
              href={notificationHref}
              className="relative p-2 rounded-lg hover:bg-bg"
              aria-label={labels.notifications}
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full" />
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-overlay bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="portal-sidebar"
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
        aria-label={isMobile ? labels.openMenu : undefined}
        className={cn(
          'fixed top-0 bottom-0 z-modal lg:z-sidebar w-72 bg-surface border-border',
          'flex flex-col transition-transform duration-200',
          locale === 'ar' ? 'right-0 border-l' : 'left-0 border-r',
          mobileOpen ? 'translate-x-0' : (locale === 'ar' ? 'translate-x-full' : '-translate-x-full'),
          'lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between p-4 border-b border-border h-14">
          <div className="flex min-w-0 items-center gap-2.5">
            <BlinkLogo variant="horizontal" size="sm" priority />
            <div className="min-w-0">
              <h1 className="sr-only">{brand.name}</h1>
              {brand.tagline && (
                <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[.12em] text-brand-yellow">{brand.tagline}</p>
              )}
            </div>
          </div>
          <button
            ref={mobileCloseRef}
            type="button"
            onClick={() => setMobileOpen(false)}
            className="-me-2 rounded-lg p-2 hover:bg-bg lg:hidden"
            aria-label={labels.closeMenu}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAdmin && (
          <div className="relative border-b border-border p-3">
            <button
              type="button"
              onClick={() => setQuickCreateOpen((open) => !open)}
              aria-expanded={quickCreateOpen}
              aria-controls="admin-quick-create-menu"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-sm font-black text-white shadow-[0_8px_24px_rgba(225,6,0,.22)] transition hover:bg-brand-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"
            >
              <Plus className="size-5" />
              <span>{labels.quickCreate}</span>
              <ChevronDown className={cn('ms-auto size-4 transition-transform', quickCreateOpen && 'rotate-180')} />
            </button>
            {quickCreateOpen && (
              <div id="admin-quick-create-menu" className="absolute inset-x-3 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
                {quickCreateItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => { setQuickCreateOpen(false); setMobileOpen(false); }} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold text-text-secondary transition hover:bg-bg hover:text-brand-red">
                      <span className="grid size-8 place-items-center rounded-lg bg-brand-red/10 text-brand-red"><Icon className="size-4" /></span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {navSections.map((section, idx) => (
            <div key={idx} className="mb-2">
              {section.title && (
                <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  {section.title}
                </p>
              )}
              <ul>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-brand-red/10 text-brand-red'
                            : 'text-text-secondary hover:bg-bg hover:text-text-primary',
                        )}
                      >
                        <Icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-brand-red')} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-brand-red text-white rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border">
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-bg transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-red to-brand-yellow flex items-center justify-center text-white font-bold text-sm">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-start">
                <p className="text-sm font-semibold truncate">{user.name || user.email}</p>
                <p className="text-xs text-text-muted truncate">{user.email}</p>
              </div>
              <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', userMenuOpen && 'rotate-180')} />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-border">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {locale === 'ar' ? 'اللغة' : locale === 'de' ? 'Sprache' : 'Language'}
                  </p>
                  <div className="flex gap-1">
                    {(['de', 'ar', 'en'] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => onLocaleChange?.(l)}
                        className={cn(
                          'flex-1 px-2 py-1.5 text-xs font-medium rounded',
                          locale === l
                            ? 'bg-brand-red text-white'
                            : 'bg-bg text-text-secondary hover:text-text-primary',
                        )}
                      >
                        {l === 'de' ? 'DE' : l === 'ar' ? 'AR' : 'EN'}
                      </button>
                    ))}
                  </div>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-status-error hover:bg-status-error/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{locale === 'ar' ? 'تسجيل الخروج' : locale === 'de' ? 'Abmelden' : 'Logout'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          'min-h-screen min-w-0 w-full overflow-x-clip lg:w-[calc(100%_-_18rem)]',
          locale === 'ar' ? 'lg:mr-72' : 'lg:ml-72',
        )}
      >
        {children}
      </main>
    </div>
  );
}
