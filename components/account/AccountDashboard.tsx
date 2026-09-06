'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Phone from 'lucide-react/dist/esm/icons/phone';
import Calendar from 'lucide-react/dist/esm/icons/calendar';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Wallet from 'lucide-react/dist/esm/icons/wallet';
import Award from 'lucide-react/dist/esm/icons/award';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Edit3 from 'lucide-react/dist/esm/icons/edit-3';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import Tag from 'lucide-react/dist/esm/icons/tag';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Star from 'lucide-react/dist/esm/icons/star';
import Gift from 'lucide-react/dist/esm/icons/gift';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Copy from 'lucide-react/dist/esm/icons/copy';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Crown from 'lucide-react/dist/esm/icons/crown';
import Flame from 'lucide-react/dist/esm/icons/flame';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Receipt from 'lucide-react/dist/esm/icons/receipt';
import Settings from 'lucide-react/dist/esm/icons/settings';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Camera from 'lucide-react/dist/esm/icons/camera';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { BackButton } from '@/components/shared/BackButton';
import { BlinkLogo } from '@/components/brand/BlinkLogo';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { extractErrorMessage } from '@/lib/foundation/error-helper';
import type { LucideIcon } from 'lucide-react';

interface AccountCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number | string;
}

interface AccountAddress {
  id: string;
  label?: string | null;
  address?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  is_default?: boolean;
}

interface AccountPaymentMethod {
  id: string;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  is_default?: boolean;
}

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
  coupons: AccountCoupon[];
  addresses: AccountAddress[];
  paymentMethods: AccountPaymentMethod[];
}

const COPY = {
  de: {
    welcome: (name: string) => `Willkommen zurück, ${name}!`,
    welcomeAnon: 'Willkommen zurück!',
    heroSubtitle: 'Verwalten Sie Ihr Konto, Ihre Bestellungen und Prämien an einem Ort.',
    editProfile: 'Profil bearbeiten',
    uploadPhoto: 'Foto hochladen',
    removePhoto: 'Foto entfernen',
    photoSaved: 'Profilfoto gespeichert.',
    photoRemoved: 'Profilfoto entfernt.',
    photoError: 'Profilfoto konnte nicht gespeichert werden.',
    photoType: 'Bitte JPG, PNG oder WebP auswählen.',
    photoSize: 'Das Profilfoto darf höchstens 2 MB groß sein.',
    removePhotoConfirm: 'Profilfoto wirklich entfernen?',
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
    name: 'Name', phone: 'Telefon', save: 'Speichern', cancel: 'Abbrechen', profileSaved: 'Profil gespeichert.', profileError: 'Profil konnte nicht gespeichert werden.',
  },
  ar: {
    welcome: (name: string) => `أهلاً بعودتك، ${name}!`,
    welcomeAnon: 'أهلاً بعودتك!',
    heroSubtitle: 'أدر حسابك وطلباتك ومكافآتك في مكان واحد.',
    editProfile: 'تعديل الملف',
    uploadPhoto: 'تحميل صورة',
    removePhoto: 'حذف الصورة',
    photoSaved: 'تم حفظ الصورة الشخصية.',
    photoRemoved: 'تم حذف الصورة الشخصية.',
    photoError: 'تعذّر حفظ الصورة الشخصية.',
    photoType: 'اختر صورة JPG أو PNG أو WebP.',
    photoSize: 'يجب ألا يتجاوز حجم الصورة 2 ميغابايت.',
    removePhotoConfirm: 'هل تريد حذف الصورة الشخصية؟',
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
    name: 'الاسم', phone: 'الهاتف', save: 'حفظ', cancel: 'إلغاء', profileSaved: 'تم حفظ الملف الشخصي.', profileError: 'تعذّر حفظ الملف الشخصي.',
  },
  en: {
    welcome: (name: string) => `Welcome back, ${name}!`,
    welcomeAnon: 'Welcome back!',
    heroSubtitle: 'Manage your account, orders, and rewards in one place.',
    editProfile: 'Edit profile',
    uploadPhoto: 'Upload photo',
    removePhoto: 'Remove photo',
    photoSaved: 'Profile photo saved.',
    photoRemoved: 'Profile photo removed.',
    photoError: 'Profile photo could not be saved.',
    photoType: 'Choose a JPG, PNG, or WebP image.',
    photoSize: 'Profile photos must be 2 MB or smaller.',
    removePhotoConfirm: 'Remove your profile photo?',
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
    name: 'Name', phone: 'Phone', save: 'Save', cancel: 'Cancel', profileSaved: 'Profile saved.', profileError: 'Profile could not be saved.',
  },
};

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

const TIER_COLORS: Record<string, { from: string; to: string; icon: LucideIcon; ring: string }> = {
  bronze: { from: 'from-amber-700/30', to: 'to-amber-900/10', icon: Award, ring: 'ring-amber-700/30' },
  silver: { from: 'from-slate-400/30', to: 'to-slate-600/10', icon: Star, ring: 'ring-slate-400/30' },
  gold: { from: 'from-yellow-500/30', to: 'to-yellow-700/10', icon: Crown, ring: 'ring-yellow-500/30' },
  platinum: { from: 'from-cyan-400/30', to: 'to-purple-500/10', icon: Sparkles, ring: 'ring-cyan-400/30' },
};

export function AccountDashboard({
  user, profile, stats, coupons, addresses, paymentMethods,
}: AccountDashboardProps) {
  const { locale: currentLocale } = useI18n();
  const locale: 'de' | 'ar' | 'en' = currentLocale === 'ar' || currentLocale === 'en' ? currentLocale : 'de';
  const [profileState, setProfileState] = useState(profile);
  const [emailCopied, setEmailCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile?.name || '');
  const [draftPhone, setDraftPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [addressState, setAddressState] = useState(addresses);
  const toastApi = useToast();

  useEffect(() => {
    let active = true;
    fetch('/api/addresses', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload) setAddressState(payload?.data?.addresses ?? payload?.addresses ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const displayName = profileState?.name || user.email?.split('@')[0] || t.welcomeAnon;
  const tierKey = (stats.loyalty.tier || 'bronze').toLowerCase() as keyof typeof TIER_COLORS;
  const tier = TIER_COLORS[tierKey] || TIER_COLORS.bronze;
  const TierIcon = tier.icon;

  const copyEmail = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(profileState?.email || user.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    }
  }, [profileState, user]);

  const saveProfile = useCallback(async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, phone: draftPhone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || t.profileError);
      const updated = payload?.data?.profile ?? payload?.profile;
      if (updated) setProfileState((current) => ({ ...(current || {}), ...updated }));
      setEditing(false);
      toastApi.success(t.profileSaved);
    } catch (error) {
      toastApi.error(error instanceof Error ? error.message : t.profileError);
    } finally {
      setSavingProfile(false);
    }
  }, [draftName, draftPhone, savingProfile, t.profileError, t.profileSaved, toastApi]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toastApi.error(t.photoType);
    if (file.size > 2 * 1024 * 1024) return toastApi.error(t.photoSize);
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/account/avatar', { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.avatar_url) throw new Error(payload.error || t.photoError);
      setProfileState((current) => ({ ...(current || { id: user.id, email: user.email }), avatar_url: payload.avatar_url }));
      toastApi.success(t.photoSaved);
    } catch (error) {
      toastApi.error(error instanceof Error ? error.message : t.photoError);
    } finally {
      URL.revokeObjectURL(preview);
      setAvatarPreview(null);
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }, [t.photoError, t.photoSaved, t.photoSize, t.photoType, toastApi, user.email, user.id]);

  const removeAvatar = useCallback(async () => {
    if (!profileState?.avatar_url || uploadingAvatar || !window.confirm(t.removePhotoConfirm)) return;
    setUploadingAvatar(true);
    try {
      const response = await fetch('/api/account/avatar', { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t.photoError);
      setProfileState((current) => current ? { ...current, avatar_url: null } : current);
      toastApi.success(t.photoRemoved);
    } catch (error) {
      toastApi.error(error instanceof Error ? error.message : t.photoError);
    } finally {
      setUploadingAvatar(false);
    }
  }, [profileState?.avatar_url, t.photoError, t.photoRemoved, t.removePhotoConfirm, toastApi, uploadingAvatar]);

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
      href: '/profile#rewards',
    },
    {
      key: 'lifetime',
      label: t.lifetimePoints,
      value: String(stats.loyalty.lifetime_points),
      icon: Sparkles,
      gradient: 'from-purple-500/20 via-purple-500/10 to-transparent',
      accent: 'text-purple-400',
      href: '/profile#rewards',
    },
    {
      key: 'wallet',
      label: t.wallet,
      value: formatCurrency(stats.wallet.balance, stats.wallet.currency, locale),
      icon: Wallet,
      gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
      accent: 'text-emerald-400',
      href: '/payment-history',
    },
  ];

  const quickActions = [
    { key: 'orders', label: t.myOrders, icon: ShoppingBag, href: '/orders', gradient: 'from-brand-red-500/15 to-brand-red-500/0' },
    { key: 'favorites', label: t.favorites, icon: Heart, href: '/favorites', gradient: 'from-pink-500/15 to-pink-500/0' },
    { key: 'addresses', label: t.addresses, icon: MapPin, href: '/addresses', gradient: 'from-emerald-500/15 to-emerald-500/0' },
    { key: 'payments', label: t.paymentMethods, icon: CreditCard, href: '/payment-history', gradient: 'from-cyan-500/15 to-cyan-500/0' },
  ];

  return (
    <div dir={dir} className="relative min-h-screen pb-24">
      {/* Premium background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-brand-red-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-brand-yellow-500/8 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><path d='M0 40 L80 40 M40 0 L40 80' stroke='%23F5B819' stroke-width='0.5'/></svg>")`,
        }} />
      </div>

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-red-500/15 via-brand-red-500/5 to-brand-yellow-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-yellow-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-brand-red-500/20 blur-2xl" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-6 sm:pt-10 sm:pb-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <BackButton fallback="/home" className="bg-black/40 ring-1 ring-white/10 hover:bg-black/60" />
            <BlinkLogo variant="horizontal" size="sm" priority />
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-br from-brand-red-500 via-brand-yellow-500 to-brand-red-500 rounded-full blur-md opacity-60" />
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-brand-red-500 to-brand-red-700 flex items-center justify-center text-3xl sm:text-4xl font-black text-white border-4 border-bg-elevated shadow-2xl">
                {avatarPreview || profileState?.avatar_url ? (
                  <Image
                    src={avatarPreview || profileState?.avatar_url || ''}
                    alt={displayName}
                    fill
                    sizes="112px"
                    unoptimized={Boolean(avatarPreview)}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <span>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {uploadingAvatar && <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60" aria-live="polite"><Loader2 className="size-7 animate-spin text-white" /></div>}
            </div>

            {/* Welcome + name */}
            <div className="flex-1 min-w-0 text-center sm:text-start">
              <h1 className="text-2xl sm:text-3xl font-black text-text mb-1">
                {t.welcome(displayName)}
              </h1>
              <p className="text-sm text-text-secondary max-w-md mx-auto sm:mx-0 mb-3">
                {t.heroSubtitle}
              </p>

              <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} />
                <button type="button" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 text-xs font-bold text-white hover:bg-black/50 disabled:opacity-50"><Camera className="size-4" />{t.uploadPhoto}</button>
                {profileState?.avatar_url && <button type="button" disabled={uploadingAvatar} onClick={() => void removeAvatar()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="size-4" />{t.removePhoto}</button>}
              </div>

              {/* Status chips */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                {profileState?.is_verified ? (
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
                  profileState?.is_active !== false
                    ? 'bg-success/15 border border-success/30 text-success'
                    : 'bg-danger/15 border border-danger/30 text-danger'
                )}>
                  {profileState?.is_active !== false ? t.active : t.inactive}
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
              onClick={() => {
                setDraftName(profileState?.name || '');
                setDraftPhone(profileState?.phone || '');
                setEditing((value) => !value);
              }}
              aria-expanded={editing}
              className="inline-flex min-h-11 items-center gap-1.5 px-3.5 rounded-xl bg-bg-elevated/70 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                  <span className="truncate">{profileState?.email || user.email}</span>
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t.phone}</p>
                <p className="text-xs font-bold text-text truncate">
                  {profileState?.phone || t.notProvided}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-elevated/50 border border-edge">
              <Calendar className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t.memberSince}</p>
                <p className="text-xs font-bold text-text truncate">
                  {profileState?.created_at ? formatDate(profileState.created_at, locale) : '—'}
                </p>
              </div>
            </div>
          </div>

          {editing && (
            <form
              className="mt-4 grid gap-3 rounded-2xl border border-brand-red-500/25 bg-black/35 p-4 backdrop-blur-xl sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
            >
              <label className="space-y-1.5 text-start">
                <span className="text-xs font-bold text-text-secondary">{t.name}</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                  className="min-h-11 w-full rounded-xl border border-edge bg-bg-elevated px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <label className="space-y-1.5 text-start">
                <span className="text-xs font-bold text-text-secondary">{t.phone}</span>
                <input
                  value={draftPhone}
                  onChange={(event) => setDraftPhone(event.target.value)}
                  type="tel"
                  autoComplete="tel"
                  className="min-h-11 w-full rounded-xl border border-edge bg-bg-elevated px-3 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <div className="flex gap-2 sm:col-span-2 sm:justify-end">
                <button type="button" onClick={() => setEditing(false)} disabled={savingProfile} className="min-h-11 rounded-xl border border-edge px-4 text-sm font-bold text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {t.cancel}
                </button>
                <button type="submit" disabled={savingProfile || draftName.trim().length < 2} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-speed-gradient px-5 text-sm font-extrabold text-white shadow-glow disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.save}
                </button>
              </div>
            </form>
          )}
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
        <section id="rewards" className="scroll-mt-24">
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
              {coupons.slice(0, 4).map((c) => (
                <div key={c.id} className="card-glass p-4 flex items-center gap-3 hover:border-edge-strong transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-yellow-500/20 to-brand-yellow-700/10 border border-brand-yellow-500/30 flex items-center justify-center flex-shrink-0">
                    <Gift className="w-6 h-6 text-brand-yellow-500" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-text truncate">{c.code}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {c.discount_type === 'percentage' ? `${c.discount_value}%` : formatCurrency(Number(c.discount_value), 'EUR', locale)}
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
        <section id="addresses" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              {t.addressBook}
            </h2>
            <Link href="/addresses" className="text-[10px] font-extrabold uppercase tracking-wider text-brand hover:text-brand/80 transition-colors">
              {t.addAddress}
            </Link>
          </div>

          {addressState.length === 0 ? (
            <div className="card-glass p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-elevated border border-edge flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-sm font-bold text-text mb-2">{t.noAddresses}</p>
              <Link
                href="/addresses?new=1"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gradient-to-br from-brand-red-500 to-brand-red-600 text-white text-xs font-extrabold shadow-glow active:scale-95 transition-transform"
              >
                {t.addAddress}
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addressState.slice(0, 4).map((a) => (
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
                      {a.address || [a.street, a.postal_code, a.city].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment methods */}
        <section id="payments" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5" />
              {t.paymentBook}
            </h2>
            <Link href="/payment-history" className="text-[10px] font-extrabold uppercase tracking-wider text-brand hover:text-brand/80 transition-colors">
              {t.viewAll}
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
              {paymentMethods.slice(0, 4).map((p) => (
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
              { key: 'lang', label: t.language, icon: Sparkles, href: '' },
              { key: 'legal', label: t.legal, icon: Receipt, href: '/legal/impressum' },
            ].map((row) => {
              const Icon = row.icon;
              if (row.key === 'lang') {
                return (
                  <div key={row.key} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-elevated text-text-secondary">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <p className="flex-1 text-sm font-bold text-text">{row.label}</p>
                    <LanguageSwitcher />
                  </div>
                );
              }
              return (
                <Link
                  key={row.key}
                  href={row.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                    'hover:bg-bg-elevated',
                  )}
                >
                  <div className="w-9 h-9 rounded-xl bg-bg-elevated text-text-secondary flex items-center justify-center">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <p className="flex-1 text-sm font-bold text-text">{row.label}</p>
                  <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
                </Link>
              );
            })}
            <DeleteAccountRow locale={locale} label={t.deleteAccount} dir={dir} />
            <LogoutRow label={t.logout} />
          </div>
        </section>
      </div>
    </div>
  );
}

function DeleteAccountRow({ label, locale, dir }: { label: string; locale: 'de' | 'ar' | 'en'; dir: 'ltr' | 'rtl' }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const t = ({
    de: {
      title: 'Konto endgültig löschen?',
      body: 'Ihr Konto wird deaktiviert. Personenbezogene Daten werden innerhalb von 30 Tagen gelöscht. Finanzdaten werden gemäß § 147 AO 10 Jahre aufbewahrt.',
      confirm: 'Zum Bestätigen tippen Sie L\u00d6SCHEN',
      confirmShort: 'L\u00d6SCHEN',
      cancel: 'Abbrechen',
      proceed: 'Konto löschen',
      success: 'Konto-Deaktivierung angefordert. Sie werden abgemeldet.',
      error: 'Löschung fehlgeschlagen. Bitte Support kontaktieren.',
    },
    ar: {
      title: '\u062d\u0630\u0641 \u0627\u0644\u062d\u0633\u0627\u0628 \u0646\u0647\u0627\u0626\u064a\u064b\u0627\u061f',
      body: '\u0633\u064a\u062a\u0645 \u062a\u0639\u0637\u064a\u0644 \u062d\u0633\u0627\u0628\u0643. \u0633\u064a\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u062e\u0635\u064a\u0629 \u062e\u0644\u0627\u0644 30 \u064a\u0648\u0645\u064b\u0627. \u062a\u062d\u062a\u0641\u0638 \u0628\u0627\u0644\u0633\u062c\u0644\u0627\u062a \u0627\u0644\u0645\u0627\u0644\u064a\u0629 10 \u0633\u0646\u0648\u0627\u062a \u0648\u0641\u0642\u064b\u0627 \u0644\u0644\u0642\u0627\u0646\u0648\u0646.',
      confirm: '\u0644\u0644\u062a\u0623\u0643\u064a\u062f\u060c \u0627\u0643\u062a\u0628 \u062d\u0630\u0641',
      confirmShort: '\u062d\u0630\u0641',
      cancel: '\u0625\u0644\u063a\u0627\u0621',
      proceed: '\u062d\u0630\u0641 \u0627\u0644\u062d\u0633\u0627\u0628',
      success: '\u062a\u0645 \u0637\u0644\u0628 \u062a\u0639\u0637\u064a\u0644 \u0627\u0644\u062d\u0633\u0627\u0628. \u0633\u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u062e\u0631\u0648\u062c\u0643.',
      error: '\u0641\u0634\u0644 \u0627\u0644\u062d\u0630\u0641. \u064a\u0631\u062c\u0649 \u0627\u0644\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062f\u0639\u0645.',
    },
    en: {
      title: 'Permanently delete your account?',
      body: 'Your account will be deactivated. Personal data will be deleted within 30 days. Financial records are retained for 10 years per German tax law.',
      confirm: 'Type DELETE to confirm',
      confirmShort: 'DELETE',
      cancel: 'Cancel',
      proceed: 'Delete account',
      success: 'Account deactivation requested. You are being signed out.',
      error: 'Deletion failed. Please contact support.',
    },
  } as const)[locale];

  const canProceed = confirmText.trim().toUpperCase() === t.confirmShort;

  async function onConfirm() {
    if (!canProceed || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(json, 'failed'));
      }
      toast({ type: 'success', message: t.success });
      // Bounce to home; the session is no longer valid after deactivation.
      setTimeout(() => {
        router.replace('/');
        router.refresh();
      }, 1200);
    } catch (error: unknown) {
      toast({ type: 'error', message: extractErrorMessage(error, t.error) });
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-danger/10 group"
      >
        <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center group-hover:bg-danger/20 transition-colors">
          <Settings className="w-4 h-4" strokeWidth={2} />
        </div>
        <p className="flex-1 text-start text-sm font-bold text-danger">{label}</p>
        <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-3xl bg-bg-elevated border border-edge p-6 shadow-2xl" dir={dir}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center flex-shrink-0">
                <Settings className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <h3 id="delete-account-title" className="text-base font-extrabold text-text">{t.title}</h3>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mb-4">{t.body}</p>
            <label className="block text-xs font-bold text-text-muted mb-1.5" htmlFor="delete-account-confirm">
              {t.confirm}
            </label>
            <input
              id="delete-account-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-bg border border-edge text-sm text-text placeholder:text-text-muted focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30 mb-4"
              autoComplete="off"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { if (!loading) { setOpen(false); setConfirmText(''); } }}
                disabled={loading}
                className="flex-1 h-11 rounded-xl bg-bg border border-edge text-text font-bold text-sm hover:bg-bg-elevated transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canProceed || loading}
                className="flex-1 h-11 rounded-xl bg-danger text-white font-extrabold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.proceed}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LogoutRow({ label }: { label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch {
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
