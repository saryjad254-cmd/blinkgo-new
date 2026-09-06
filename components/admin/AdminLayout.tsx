'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import Users from 'lucide-react/dist/esm/icons/users';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Store from 'lucide-react/dist/esm/icons/store';
import Shield from 'lucide-react/dist/esm/icons/shield';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import MapIcon from 'lucide-react/dist/esm/icons/map';
import DollarSign from 'lucide-react/dist/esm/icons/dollar-sign';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Settings from 'lucide-react/dist/esm/icons/settings';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Menu from 'lucide-react/dist/esm/icons/menu';
import X from 'lucide-react/dist/esm/icons/x';
import Ticket from 'lucide-react/dist/esm/icons/ticket';
import Megaphone from 'lucide-react/dist/esm/icons/megaphone';
import Award from 'lucide-react/dist/esm/icons/award';
import BarChart3 from 'lucide-react/dist/esm/icons/bar-chart-3';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import Database from 'lucide-react/dist/esm/icons/database';
import Radio from 'lucide-react/dist/esm/icons/radio';
import Package from 'lucide-react/dist/esm/icons/package';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ToggleLeft from 'lucide-react/dist/esm/icons/toggle-left';
import { cn } from '@/lib/cn';
import { BlinkLogo } from '@/components/brand/BlinkLogo';

export interface AdminUser {
  id?: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager';
  avatarUrl?: string;
}

interface NavItem {
  href: string;
  label: string;
  labelAr: string;
  labelEn?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  permission?: 'super_admin' | 'admin' | 'manager';
  requiredPermission?: 'payment_support';
}

interface NavSection {
  title: string;
  titleAr: string;
  titleEn?: string;
  items: NavItem[];
}

export function AdminLayout({
  children,
  user,
  locale = 'de',
}: {
  children: React.ReactNode;
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [trustedPermissions, setTrustedPermissions] = useState<string[]>([]);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarOpenTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const data = payload?.data ?? payload;
        setTrustedPermissions(Array.isArray(data?.user?.permissions) ? data.user.permissions : []);
      })
      .catch(() => { if (!cancelled) setTrustedPermissions([]); });
    return () => { cancelled = true; };
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setSidebarOpen(false); });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!sidebarRef.current) return;
    sidebarRef.current.inert = isMobile && !sidebarOpen;
  }, [isMobile, sidebarOpen]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnTarget = sidebarOpenTriggerRef.current;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => sidebarCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
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
  }, [isMobile, sidebarOpen]);

  const isAr = locale === 'ar';

  // Define navigation sections
  const sections: NavSection[] = [
    {
      title: 'Übersicht',
      titleAr: 'نظرة عامة',
      titleEn: 'Overview',
      items: [
        {
          href: '/admin',
          label: 'Dashboard',
          labelEn: 'Dashboard',
          labelAr: 'لوحة التحكم',
          icon: LayoutDashboard,
        },
        {
          href: '/admin/operations',
          label: 'Operations',
          labelEn: 'Operations',
          labelAr: 'العمليات',
          icon: Radio,
          badge: 'LIVE',
        },
        {
          href: '/admin/analytics',
          label: 'Analytics',
          labelEn: 'Analytics',
          labelAr: 'التحليلات',
          icon: BarChart3,
        },
      ],
    },
    {
      title: 'Benutzer',
      titleAr: 'المستخدمون',
      titleEn: 'Users',
      items: [
        {
          href: '/admin/onboarding',
          label: 'Erstellen & einrichten',
          labelEn: 'Create & onboard',
          labelAr: 'الإنشاء والتجهيز',
          icon: UserPlus,
          permission: 'admin',
        },
        {
          href: '/admin/users',
          label: 'Kunden',
          labelEn: 'Customers',
          labelAr: 'العملاء',
          icon: Users,
        },
        {
          href: '/admin/drivers',
          label: 'Fahrer',
          labelEn: 'Drivers',
          labelAr: 'السائقون',
          icon: Truck,
        },
        {
          href: '/admin/restaurants',
          label: 'Restaurants',
          labelEn: 'Restaurants',
          labelAr: 'المطاعم',
          icon: Store,
        },
        {
          href: '/admin/admins',
          label: 'Administratoren',
          labelEn: 'Administrators',
          labelAr: 'المشرفون',
          icon: Shield,
          permission: 'admin',
        },
      ],
    },
    {
      title: 'Betrieb',
      titleAr: 'العمليات',
      titleEn: 'Operations',
      items: [
        {
          href: '/admin/orders',
          label: 'Bestellungen',
          labelEn: 'Orders',
          labelAr: 'الطلبات',
          icon: ShoppingBag,
        },
        {
          href: '/admin/delays',
          label: 'Verzögerungen',
          labelEn: 'Delays',
          labelAr: 'التأخيرات',
          icon: AlertTriangle,
        },
        {
          href: '/admin/products',
          label: 'Produkte & Freigaben',
          labelEn: 'Products & approvals',
          labelAr: 'المنتجات والموافقات',
          icon: Package,
        },
        {
          href: '/admin/map',
          label: 'Live-Karte',
          labelEn: 'Live map',
          labelAr: 'الخريطة المباشرة',
          icon: MapIcon,
        },
        {
          href: '/admin/notifications',
          label: 'Benachrichtigungen',
          labelEn: 'Notifications',
          labelAr: 'الإشعارات',
          icon: Bell,
        },
      ],
    },
    {
      title: 'Finanzen',
      titleAr: 'المالية',
      titleEn: 'Finance',
      items: [
        {
          href: '/admin/finance',
          label: 'Umsatz & Berichte',
          labelEn: 'Revenue & reports',
          labelAr: 'الإيرادات والتقارير',
          icon: DollarSign,
        },
        {
          href: '/admin/refunds',
          label: 'Rückerstattungen',
          labelEn: 'Refunds',
          labelAr: 'الاستردادات',
          icon: DollarSign,
          requiredPermission: 'payment_support',
        },
      ],
    },
    {
      title: 'Marketing',
      titleAr: 'التسويق',
      titleEn: 'Marketing',
      items: [
        {
          href: '/admin/coupons',
          label: 'Gutscheine',
          labelEn: 'Coupons',
          labelAr: 'القسائم',
          icon: Ticket,
        },
        {
          href: '/admin/promotions',
          label: 'Aktionen',
          labelEn: 'Promotions',
          labelAr: 'العروض',
          icon: Megaphone,
        },
        {
          href: '/admin/referrals',
          label: 'Empfehlungen',
          labelEn: 'Referrals',
          labelAr: 'الإحالات',
          icon: Users,
        },
        {
          href: '/admin/loyalty',
          label: 'Treuepunkte',
          labelEn: 'Loyalty',
          labelAr: 'الولاء',
          icon: Award,
        },
      ],
    },
    {
      title: 'System',
      titleAr: 'النظام',
      titleEn: 'System',
      items: [
        {
          href: '/admin/system',
          label: 'Einstellungen',
          labelEn: 'Settings',
          labelAr: 'الإعدادات',
          icon: Settings,
          permission: 'admin',
        },
        {
          href: '/admin/configuration',
          label: 'Konfiguration',
          labelEn: 'Configuration',
          labelAr: 'الإعدادات',
          icon: Settings,
          permission: 'super_admin',
        },
        {
          href: '/admin/feature-flags',
          label: 'Feature-Steuerung',
          labelEn: 'Feature controls',
          labelAr: 'التحكم بالميزات',
          icon: ToggleLeft,
          permission: 'manager',
        },
        {
          href: '/admin/audit',
          label: 'Audit-Log',
          labelEn: 'Audit log',
          labelAr: 'سجل التدقيق',
          icon: Database,
          permission: 'super_admin',
        },
      ],
    },
  ];

  // Filter by permission
  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.requiredPermission && user.role !== 'super_admin' && !trustedPermissions.includes(item.requiredPermission)) return false;
        if (!item.permission) return true;
        if (user.role === 'super_admin') return true;
        if (item.permission === 'admin' && user.role === 'admin') return true;
        if (item.permission === 'manager') return true;
        return false;
      }),
    }))
    .filter((s) => s.items.length > 0);

  const labels = {
    de: {
      logout: 'Abmelden',
      search: 'Suche...',
      viewProfile: 'Profil anzeigen',
      settings: 'Einstellungen',
      online: 'Online',
      role: 'Rolle',
    },
    ar: {
      logout: 'تسجيل الخروج',
      search: 'بحث...',
      viewProfile: 'عرض الملف',
      settings: 'الإعدادات',
      online: 'متصل',
      role: 'الدور',
    },
    en: {
      logout: 'Log out',
      search: 'Search...',
      viewProfile: 'View profile',
      settings: 'Settings',
      online: 'Online',
      role: 'Role',
    },
  };
  const t = labels[locale] ?? labels.de;

  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const ROLE_BADGE: Record<string, { label: string; color: string }> = {
    super_admin: { label: isAr ? 'سوبر آدمن' : 'Super Admin', color: 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active' },
    admin: { label: isAr ? 'مشرف' : 'Admin', color: 'bg-brand-yellow-500' },
    manager: { label: isAr ? 'مدير' : 'Manager', color: 'bg-cyan-500' },
  };
  // (Role badges are language-neutral - Super Admin, Admin, Manager work in EN, DE, AR)
  const roleBadge = ROLE_BADGE[user.role] ?? ROLE_BADGE.manager;

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  return (
    <div
      className="min-h-screen bg-bg text-white flex"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Mobile overlay */}
      {sidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="admin-sidebar"
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
        aria-label={isMobile ? (locale === 'ar' ? 'قائمة الإدارة' : locale === 'en' ? 'Admin menu' : 'Admin-Menü') : undefined}
        className={cn(
          'fixed lg:sticky top-0 z-50 h-screen w-72 flex-shrink-0',
          'bg-gradient-to-b from-ink-900 via-ink-800 to-ink-900',
          'border-e border-edge overflow-y-auto',
          'transition-transform duration-300',
          isMobile && !sidebarOpen && '-translate-x-full rtl:translate-x-full',
          isMobile && sidebarOpen && 'translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-edge flex items-center justify-between">
          <Link href="/admin" aria-label="BlinkGo Admin" className="group flex min-h-11 items-center gap-2.5 rounded-xl">
            <BlinkLogo variant="horizontal" size="sm" priority className="transition-transform group-hover:scale-[1.02]" />
            <div className="min-w-0">
              <p className="sr-only">BlinkGo</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
                {isAr ? 'لوحة الإدارة' : locale === 'en' ? 'Admin Panel' : 'Admin Panel'}
              </p>
            </div>
          </Link>
          {isMobile && (
            <button
              ref={sidebarCloseRef}
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label={locale === 'ar' ? 'إغلاق القائمة' : locale === 'en' ? 'Close menu' : 'Menü schließen'}
              className="lg:hidden w-9 h-9 rounded-lg bg-ink-700 flex items-center justify-center text-text-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* User card */}
        <div className="px-3 py-3 border-b border-edge">
          <div className="rounded-2xl bg-ink-700/50 border border-edge p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active flex items-center justify-center font-extrabold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-white truncate">{user.name}</p>
              <span
                className={cn(
                  'inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider text-white',
                  roleBadge.color,
                )}
              >
                {roleBadge.label}
              </span>
            </div>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="px-3 py-4 space-y-5">
          {filteredSections.map((section) => (
            <div key={section.title}>
              <p className="px-2 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
                {isAr ? section.titleAr : locale === 'en' ? (section.titleEn ?? section.title) : section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(item.href + '/')) ||
                    (item.href === '/admin' && pathname === '/admin');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group',
                        isActive
                          ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow'
                          : 'text-text-secondary hover:bg-ink-700 hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-4 h-4 flex-shrink-0',
                          isActive ? 'text-white' : 'text-text-muted group-hover:text-brand-red-500',
                        )}
                      />
                      <span className="flex-1 truncate">
                        {isAr ? item.labelAr : locale === 'en' ? (item.labelEn ?? item.label) : item.label}
                      </span>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded-md bg-danger text-white text-[10px] font-extrabold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer / logout */}
        <div className="absolute bottom-0 inset-x-0 p-3 border-t border-edge bg-ink-900/80 backdrop-blur">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-text-secondary hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-edge">
          <div className="px-4 lg:px-8 h-16 flex items-center gap-3">
            <button
              ref={sidebarOpenTriggerRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label={locale === 'ar' ? 'فتح القائمة' : locale === 'en' ? 'Open menu' : 'Menü öffnen'}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
              className="lg:hidden w-10 h-10 rounded-xl bg-ink-700 flex items-center justify-center text-text-secondary"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t.online}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 px-4 lg:px-8 py-6 lg:py-8 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
