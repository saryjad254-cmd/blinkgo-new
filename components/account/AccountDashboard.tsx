'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Phone, Calendar, ShoppingBag, Wallet, Award, ArrowRight, LogOut,
  Edit3, Camera, MapPin, CreditCard, Tag, Bell, Shield, Star, Gift, ChevronRight,
  CheckCircle2, Copy, Sparkles, Crown, Flame, Heart, Receipt, Settings, Loader2
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface AccountDashboardProps {
  user: { id: string; email: string };
  profile: {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
    role?: string;
    is_active?: boolean;
    is_verified?: boolean;
    created_at?: string;
    last_login_at?: string | null;
    avatar_url?: string | null;
  } | null;
  stats: {
    orderCount: number;
    recentOrders: { id: string; order_number?: string | null; total?: number; status?: string; created_at: string }[];
    loyalty: { points: number; lifetime_points: number; tier: string };
    wallet: { balance: number; currency: string };
  };
  coupons: any[];
  addresses: any[];
  paymentMethods: any[];
}

const COPY = {
  de: {
    welcome: (name: string) => `Willkommen zurück, ${name}!`,
    welcomeAnon: 'Willkommen zurück!',
    heroSubtitle: 'Verwalte dein Konto, Bestellungen und Prämien an einem Ort.',
    editProfile: 'Profil bearbeiten',
    uploadPhoto: 'Foto hochladen',
    verified: 'Verifiziert',
    notVerified: 'Nicht verifiziert',
    active: 'Aktiv',
    inactive: 'Inaktiv',
    memberSince: 'Mitglied seit',
    lastLogin: 'Letzte Anmeldung',
    quickActions: 'Schnellzugriff',
    myOrders: 'Meine Bestellungen',
    favorites: 'Favoriten',
    addresses: 'Adressen',
    paymentMethods: 'Zahlungsmethoden',
    stats: 'Meine Statistik',
    orders: 'Bestellungen',
    loyaltyPoints: 'Treuepunkte',
    lifetimePoints: 'Insgesamt gesammelt',
    wallet: 'Guthaben',
    tier: 'Stufe',
    coupons: 'Aktive Gutscheine',
    noCoupons: 'Keine aktiven Gutscheine',
    couponsHint: 'Neue Gutscheine werden hier angezeigt.',
    addressBook: 'Adressbuch',
    noAddresses: 'Keine gespeicherten Adressen',
    addAddress: 'Adresse hinzufügen',
    paymentBook: 'Zahlungsmethoden',
    noPaymentMethods: 'Keine gespeicherten Zahlungsmethoden',
    addPayment: 'Zahlungsmethode hinzufügen',
    settings: 'Einstellungen',
    notifications: 'Benachrichtigungen',
    security: 'Sicherheit',
    language: 'Sprache',
    legal: 'Rechtliches',
    deleteAccount: 'Konto löschen',
    logout: 'Abmelden',
    copyEmail: 'E-Mail kopieren',
    emailCopied: 'E-Mail kopiert!',
    notProvided: 'Nicht angegeben',
    viewAll: 'Alle anzeigen',
  },
  ar: {
    welcome: (name: string) => `أهلاً بعودتك، ${name}!`,
    welcomeAnon: 'أهلاً بعودتك!',
    heroSubtitle: 'أدر حسابك وطلباتك ومكافآتك في مكان واحد.',
    editProfile: 'تعديل الملف',
    uploadPhoto: 'تحميل صورة',
    verified: 'موثّق',
    notVerified: 'غير موثّق',
    active: 'نشط',
    inactive: 'غير نشط',
    memberSince: 'عضو منذ',
    lastLogin: 'آخر تسجيل دخول',
    quickActions: 'إجراءات سريعة',
    myOrders: 'طلباتي',
    favorites: 'المفضلة',
    addresses: 'العناوين',
    paymentMethods: 'طرق الدفع',
    stats: 'إحصائياتي',
    orders: 'الطلبات',
    loyaltyPoints: 'نقاط الولاء',
    lifetimePoints: 'إجمالي ما جمعته',
    wallet: 'الرصيد',
    tier: 'المستوى',
    coupons: 'القسائم النشطة',
    noCoupons: 'لا توجد قسائم نشطة',
    couponsHint: 'ستظهر القسائم الجديدة هنا.',
    addressBook: 'دفتر العناوين',
    noAddresses: 'لا توجد عناوين محفوظة',
    addAddress: 'إضافة عنوان',
    paymentBook: 'طرق الدفع',
    noPaymentMethods: 'لا توجد طرق دفع محفوظة',
    addPayment: 'إضافة طريقة دفع',
    settings: 'الإعدادات',
    notifications: 'الإشعارات',
    security: 'الأمان',
    language: 'اللغة',
    legal: 'قانوني',
    deleteAccount: 'حذف الحساب',
    logout: 'تسجيل الخروج',
    copyEmail: 'نسخ البريد',
    emailCopied: 'تم نسخ البريد!',
    notProvided: 'غير محدد',
    viewAll: 'عرض الكل',
  },
  en: {
    welcome: (name: string) => `Welcome back, ${name}!`,
    welcomeAnon: 'Welcome back!',
    heroSubtitle: 'Manage your account, orders, and rewards in one place.',
    editProfile: 'Edit profile',
    uploadPhoto: 'Upload photo',
    verified: 'Verified',
    notVerified: 'Not verified',
    active: 'Active',
    inactive: 'Inactive',
    memberSince: 'Member since',
    lastLogin: 'Last login',
    quickActions: 'Quick actions',
    myOrders: 'My orders',
    favorites: 'Favorites',
    addresses: 'Addresses',
    paymentMethods: 'Payment methods',
    stats: 'My statistics',
    orders: 'Orders',
    loyaltyPoints: 'Loyalty points',
    lifetimePoints: 'Lifetime earned',
    wallet: 'Wallet',
    tier: 'Tier',
    coupons: 'Active coupons',
    noCoupons: 'No active coupons',
    couponsHint: 'New coupons will appear here.',
    addressBook: 'Address book',
    noAddresses: 'No saved addresses',
    addAddress: 'Add address',
    paymentBook: 'Payment methods',
    noPaymentMethods: 'No saved payment methods',
    addPayment: 'Add payment method',
    settings: 'Settings',
    notifications: 'Notifications',
    security: 'Security',
    language: 'Language',
    legal: 'Legal',
    deleteAccount: 'Delete account',
    logout: 'Log out',
    copyEmail: 'Copy email',
    emailCopied: 'Email copied!',
    notProvided: 'Not provided',
    viewAll: 'View all',
  },
};

function getLocaleFromCookie(): 'de' | 'ar' | 'en' {
  if (typeof document === 'undefined') return 'de';
  const m = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
  const v = m?.split('=')[1]?.trim();
  if (v === 'ar' || v === 'en' || v === 'de') return v;
  return 'de';
}

function formatDate(iso: string, locale: 'de' | 'ar' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const map = { de: 'de-DE', ar: 'ar', en: 'en-US' };
  return d.toLocaleDateString(map[locale], { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number, currency: string, locale: 'de' | 'ar' | 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount || 0);
}

const TIER_COLORS: Record<string, { from: string; to: string; icon: any; ring: string }> = {
  bronze: { from: 'from-amber-700/30', to: 'to-amber-900/10', icon: Award, ring: 'ring-amber-700/30' },
  silver: { from: 'from-slate-400/30', to: 'to-slate-600/10', icon: Star, ring: 'ring-slate-400/30' },
  gold: { from: 'from-yellow-500/30', to: 'to-yellow-700/10', icon: Crown, ring: 'ring-yellow-500/30' },
  platinum: { from: 'from-cyan-400/30', to: 'to-purple-500/10', icon: Sparkles, ring: 'ring-cyan-400/30' },
};

export function AccountDashboard({
  user, profile, stats, coupons, addresses, paymentMethods,
}: AccountDashboardProps) {
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');
  const [emailCopied, setEmailCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLocale(getLocaleFromCookie());
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const displayName = profile?.name || user.email?.split('@')[0] || t.welcomeAnon;
  const tierKey = (stats.loyalty.tier || 'bronze').toLowerCase() as keyof typeof TIER_COLORS;
  const tier = TIER_COLORS[tierKey] || TIER_COLORS.bronze;
  const TierIcon = tier.icon;

  const copyEmail = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(profile?.email || user.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  }, [profile, user]);

  // Stat cards data
  const statCards = [
    {
      key: 'orders',
      label: t.orders,
      value: String(stats.orderCount),
      icon: ShoppingBag,
      gradient: 'from-brand-red-500/20 via-brand-red-500/10 to-transparent',
      accent: 'text-brand-red-500',
      href: '/orders',
    },
    {
      key: 'loyalty',
      label: t.loyaltyPoints,
      value: String(stats.loyalty.points),
      icon: Flame,
      gradient: 'from-brand-yellow-500/20 via-brand-yellow-500/10 to-transparent',
      accent: 'text-brand-yellow-500',
      href: '/profile?tab=loyalty',
    },
    {
      key: 'lifetime',
      label: t.lifetimePoints,
      value: String(stats.loyalty.lifetime_points),
      icon: Sparkles,
      gradient: 'from-purple-500/20 via-purple-500/10 to-transparent',
      accent: 'text-purple-400',
      href: '/profile?tab=loyalty',
    },
    {
      key: 'wallet',
      label: t.wallet,
      value: formatCurrency(stats.wallet.balance, stats.wallet.currency, locale),
      icon: Wallet,
      gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
      accent: 'text-emerald-400',
      href: '/profile?tab=wallet',
    },
  ];

  const quickActions = [
    { key: 'orders', label: t.myOrders, icon: ShoppingBag, href: '/orders', gradient: 'from-brand-red-500/15 to-brand-red-500/0' },
    { key: 'favorites', label: t.favorites, icon: Heart, href: '/favorites', gradient: 'from-pink-500/15 to-pink-500/0' },
    { key: 'addresses', label: t.addresses, icon: MapPin, href: '/profile?tab=addresses', gradient: 'from-emerald-500/15 to-emerald-500/0' },
    { key: 'payments', label: t.paymentMethods, icon: CreditCard, href: '/profile?tab=payments', gradient: 'from-cyan-500/15 to-cyan-500/0' },
  ];

  return (
    <div dir={dir} className="relative min-h-screen pb-24">
      {/* Premium background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-red-500/10 blur-[140px]" />
        <div className="absolute bottom-0 end-0 w-[600px] h-[600px] rounded-full bg-brand-yellow-500/8 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><path d='M0 40 L80 40 M40 0 L40 80' stroke='%23F5B819' stroke-width='0.5'/></svg>")`,
        }} />
      </div>

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-red-500/15 via-brand-red-500/5 to-brand-yellow-500/10" />
        <div className="absolute top-0 end-0 w-64 h-64 rounded-full bg-brand-yellow-500/15 blur-3xl" />
        <div className="absolute bottom-0 start-0 w-48 h-48 rounded-full bg-brand-red-500/20 blur-2xl" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-6 sm:pt-10 sm:pb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-br from-brand-red-500 via-brand-yellow-500 to-brand-red-500 rounded-full blur-md opacity-60" />
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-brand-red-500 to-brand-red-700 flex items-center justify-center text-3xl sm:text-4xl font-black text-white border-4 border-bg-elevated shadow-2xl">
                {profile?.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={displayName}
                    fill
                    sizes="112px"
                    className="rounded-full object-cover"
                  />
                ) : (
                  <span>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <button
                type="button"
                className="absolute -bottom-1 -end-1 w-9 h-9 rounded-full bg-bg-elevated border-2 border-bg flex items-center justify-center hover:bg-bg transition-colors"
                aria-label={t.uploadPhoto}
              >
                <Camera className="w-4 h-4 text-text-secondary" />
              </button>
            </div>

            {/* Welcome + name */}
            <div className="flex-1 min-w-0 text-center sm:text-start">
              <h1 className="text-2xl sm:text-3xl font-black text-text mb-1">
                {t.welcome(displayName)}
              </h1>
              <p className="text-sm text-text-secondary max-w-md mx-auto sm:mx-0 mb-3">
                {t.heroSubtitle}
              </p>

              {/* Status chips */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                {profile?.is_verified ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 border border-success/30 text-[10px] font-extrabold text-success uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> {t.verified}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 border border-warning/30 text-[10px] font-extrabold text-warning uppercase tracking-wider">
                    {t.notVerified}
                  </span>
                )}
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider',
                  profile?.is_active !== false
                    ? 'bg-success/15 border border-success/30 text-success'
                    : 'bg-danger/15 border border-danger/30 text-danger'
                )}>
                  {profile?.is_active !== false ? t.active : t.inactive}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r text-[10px] font-extrabold uppercase tracking-wider ring-1',
                  tier.from, tier.to, tier.ring, 'text-text'
                )}>
                  <TierIcon className="w-3 h-3" /> {t.tier}: {stats.loyalty.tier || 'Bronze'}
                </span>
              </div>
            </div>

            {/* Edit button */}
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-bg-elevated/70 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all flex-shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.editProfile}</span>
            </button>
          </div>

          {/* Personal info row */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-elevated/50 border border-edge">
              <Mail className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t.copyEmail}</p>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="text-xs font-bold text-text truncate max-w-full hover:text-brand transition-colors flex items-center gap-1"
                >
                  <span className="truncate">{profile?.email || user.email}</span>
                  {emailCopied ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-text-muted flex-shrink-0" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-elevated/50 border border-edge">
              <Phone className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</p>
                <p className="text-xs font-bold text-text truncate">
                  {profile?.phone || t.notProvided}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-elevated/50 border border-edge">
              <Calendar className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t.memberSince}</p>
                <p className="text-xs font-bold text-text truncate">
                  {profile?.created_at ? formatDate(profile.created_at, locale) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pb-12 space-y-6">
        {/* Quick actions */}
        <section>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted mb-3">
            {t.quickActions}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className={cn(
                    'group relative card-glass p-4 overflow-hidden hover:border-edge-strong transition-all duration-300 ease-silk hover:-translate-y-0.5'
                  )}
                >
                  <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity', action.gradient)} />
                  <div className="relative flex flex-col items-start gap-2">
                    <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-edge flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5 text-brand-red-500" strokeWidth={2} />
                    </div>
                    <p className="text-sm font-extrabold text-text">{action.label}</p>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-red-500 group-hover:translate-x-1 transition-all rtl:rotate-180" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Stats */}
        <section>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted mb-3">
            {t.stats}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((s, i) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  className={cn(
                    'group relative card-glass p-4 overflow-hidden hover:border-edge-strong transition-all duration-300 ease-silk hover:-translate-y-0.5',
                    'animate-slide-in'
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60 group-hover:opacity-100 transition-opacity', s.gradient)} />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn(
                        'w-9 h-9 rounded-xl bg-bg-elevated border border-edge flex items-center justify-center'
                      )}>
                        <Icon className={cn('w-4 h-4', s.accent)} strokeWidth={2.5} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-text mb-0.5 tabular-nums">{s.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{s.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Coupons */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" />
              {t.coupons}
            </h2>
            {coupons.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-yellow-500 text-bg text-[10px] font-black">
                {coupons.length}
              </span>
            )}
          </div>

          {coupons.length === 0 ? (
            <div className="card-glass p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-elevated border border-edge flex items-center justify-center mb-3">
                <Tag className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-sm font-bold text-text mb-0.5">{t.noCoupons}</p>
              <p className="text-xs text-text-muted">{t.couponsHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {coupons.slice(0, 4).map((c: any) => (
                <div key={c.id} className="card-glass p-4 flex items-center gap-3 hover:border-edge-strong transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-yellow-500/20 to-brand-yellow-700/10 border border-brand-yellow-500/30 flex items-center justify-center flex-shrink-0">
                    <Gift className="w-6 h-6 text-brand-yellow-500" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-text truncate">{c.code}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatCurrency(c.discount_value, 'EUR', locale)}
                      {' '}{locale === 'ar' ? 'خصم' : locale === 'de' ? 'Rabatt' : 'off'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(c.code)}
                    className="p-2 rounded-lg hover:bg-bg-elevated transition-colors"
                    aria-label="Copy"
                  >
                    <Copy className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Addresses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              {t.addressBook}
            </h2>
            <Link href="/profile?tab=addresses" className="text-[10px] font-extrabold uppercase tracking-wider text-brand hover:text-brand/80 transition-colors">
              {t.addAddress}
            </Link>
          </div>

          {addresses.length === 0 ? (
            <div className="card-glass p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-elevated border border-edge flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-sm font-bold text-text mb-2">{t.noAddresses}</p>
              <Link
                href="/profile?tab=addresses&action=new"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white text-xs font-extrabold shadow-glow active:scale-95 transition-transform"
              >
                {t.addAddress}
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addresses.slice(0, 4).map((a: any) => (
                <div key={a.id} className={cn(
                  'card-glass p-4 flex items-start gap-3',
                  a.is_default && 'border-brand-red-500/40 bg-gradient-to-br from-brand-red-500/5 to-transparent'
                )}>
                  <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-edge flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-brand-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-extrabold text-text truncate">{a.label || (locale === 'ar' ? 'العنوان' : locale === 'de' ? 'Adresse' : 'Address')}</p>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-red-500/15 border border-brand-red-500/30 text-[9px] font-extrabold text-brand uppercase tracking-wider">
                          {locale === 'ar' ? 'افتراضي' : locale === 'de' ? 'Standard' : 'Default'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary truncate">
                      {a.street}, {a.postal_code} {a.city}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment methods */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5" />
              {t.paymentBook}
            </h2>
            <Link href="/profile?tab=payments" className="text-[10px] font-extrabold uppercase tracking-wider text-brand hover:text-brand/80 transition-colors">
              {t.addPayment}
            </Link>
          </div>

          {paymentMethods.length === 0 ? (
            <div className="card-glass p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-elevated border border-edge flex items-center justify-center mb-3">
                <CreditCard className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-sm font-bold text-text">{t.noPaymentMethods}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paymentMethods.slice(0, 4).map((p: any) => (
                <div key={p.id} className="card-glass p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/15 to-cyan-500/5 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-text truncate">
                      {(p.brand || 'Card').toUpperCase()} •••• {p.last4 || '****'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {p.exp_month}/{p.exp_year}
                    </p>
                  </div>
                  {p.is_default && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-extrabold text-cyan-400 uppercase tracking-wider">
                      {locale === 'ar' ? 'افتراضي' : locale === 'de' ? 'Standard' : 'Default'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Settings */}
        <section>
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted mb-3">
            {t.settings}
          </h2>
          <div className="card-glass p-1.5">
            {[
              { key: 'notif', label: t.notifications, icon: Bell, href: '/notifications' },
              { key: 'security', label: t.security, icon: Shield, href: '/forgot-password' },
              { key: 'lang', label: t.language, icon: Sparkles, href: '#' },
              { key: 'legal', label: t.legal, icon: Receipt, href: '/legal/impressum' },
              { key: 'delete', label: t.deleteAccount, icon: Settings, href: '/account/delete', danger: true },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <Link
                  key={row.key}
                  href={row.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                    'hover:bg-bg-elevated',
                    row.danger && 'hover:bg-danger/10'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center',
                    row.danger
                      ? 'bg-danger/10 text-danger'
                      : 'bg-bg-elevated text-text-secondary'
                  )}>
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <p className={cn(
                    'flex-1 text-sm font-bold',
                    row.danger ? 'text-danger' : 'text-text'
                  )}>{row.label}</p>
                  <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
                </Link>
              );
            })}
            <LogoutRow locale={locale} label={t.logout} dir={dir} />
          </div>
        </section>
      </div>
    </div>
  );
}

function LogoutRow({ label, locale, dir }: { label: string; locale: 'de' | 'ar' | 'en'; dir: 'ltr' | 'rtl' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (e) {
      setLoading(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-danger/10 transition-colors group"
    >
      <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center group-hover:bg-danger/20 transition-colors">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" strokeWidth={2} />}
      </div>
      <p className="flex-1 text-start text-sm font-bold text-danger">{label}</p>
      <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
    </button>
  );
}
