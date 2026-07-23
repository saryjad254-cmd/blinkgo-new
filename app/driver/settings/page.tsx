'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Navigation as NavIcon,
  Moon,
  Sun,
  Monitor,
  HelpCircle,
  Phone,
  FileText,
  Shield,
  LogOut,
  ChevronRight,
  ArrowLeft,
  Battery,
  AlertCircle,
  Mail,
  Smartphone,
  MapPin,
  Check,
  Car,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/shared/PageHeader';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';
import { createBrowserClient } from '@/lib/supabase/client';
import { EmergencyCallButton } from '@/components/driver/EmergencyCallButton';

/**
 * Driver Settings
 * ───────────────
 * Central settings page for drivers. All preferences are persisted in
 * localStorage so they survive page reloads. Account-level changes
 * (language, dark mode) are stored both in localStorage and Supabase
 * user_metadata so they can be replicated server-side.
 */

const SETTINGS_KEYS = {
  language: 'blinkgo-driver-language',
  navProvider: 'blinkgo-driver-nav-provider',
  darkMode: 'blinkgo-driver-dark-mode',
  push: 'blinkgo-driver-push',
  sounds: 'blinkgo-driver-sounds',
  emergencyContact: 'blinkgo-driver-emergency',
};

type NavProvider = 'google' | 'apple' | 'waze';
type DarkMode = 'auto' | 'light' | 'dark';

export default function DriverSettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [navProvider, setNavProvider] = useState<NavProvider>('google');
  const [darkMode, setDarkMode] = useState<DarkMode>('dark');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; email: string; phone: string | null } | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setNavProvider((localStorage.getItem(SETTINGS_KEYS.navProvider) as NavProvider) || 'google');
    setDarkMode((localStorage.getItem(SETTINGS_KEYS.darkMode) as DarkMode) || 'dark');
    setPushEnabled(localStorage.getItem(SETTINGS_KEYS.push) !== 'false');
    setSoundsEnabled(localStorage.getItem(SETTINGS_KEYS.sounds) !== 'false');
    setEmergencyContact(localStorage.getItem(SETTINGS_KEYS.emergencyContact) || '');
    // Fetch user info
    const sb = createBrowserClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: u } = await sb
          .from('users')
          .select('id, name, email, phone')
          .eq('id', data.user.id)
          .single();
        if (u) setUser(u as any);
      }
    });
  }, []);

  // Persist on change
  const persist = (key: string, value: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
  };

  const handleLanguageChange = (lang: 'de' | 'ar' | 'en') => {
    setLocale(lang);
    persist(SETTINGS_KEYS.language, lang);
  };

  const handleNavProviderChange = (p: NavProvider) => {
    setNavProvider(p);
    persist(SETTINGS_KEYS.navProvider, p);
  };

  const handleDarkModeChange = (d: DarkMode) => {
    setDarkMode(d);
    persist(SETTINGS_KEYS.darkMode, d);
    if (typeof document !== 'undefined') {
      if (d === 'light') document.documentElement.classList.remove('dark');
      else if (d === 'dark') document.documentElement.classList.add('dark');
      // 'auto' = use system preference
    }
  };

  const handlePushToggle = () => {
    const next = !pushEnabled;
    setPushEnabled(next);
    persist(SETTINGS_KEYS.push, String(next));
  };

  const handleSoundsToggle = () => {
    const next = !soundsEnabled;
    setSoundsEnabled(next);
    persist(SETTINGS_KEYS.sounds, String(next));
  };

  const handleSaveEmergency = () => {
    persist(SETTINGS_KEYS.emergencyContact, emergencyContact);
    toast({ type: 'success', message: locale === 'ar' ? 'تم الحفظ' : locale === 'en' ? 'Saved' : 'Gespeichert' });
  };

  const handleLogout = async () => {
    // Call server route to clear httpOnly auth cookies (otherwise
    // the user remains logged in via middleware).
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API failed:', e);
    }
    try {
      const sb = createBrowserClient();
      await sb.auth.signOut();
    } catch {
      // ignore
    }
    window.location.href = '/login';
  };

  const isRtl = locale === 'ar';

  return (
    <div className="min-h-screen bg-bg pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader title={t.driver?.settings || 'Settings'} back />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Profile card */}
        {user && (
          <div className="rounded-2xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/5 border border-brand-red-500/30 p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active flex items-center justify-center font-extrabold text-2xl text-white flex-shrink-0">
                {user.name?.[0]?.toUpperCase() || 'D'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-extrabold text-white truncate">{user.name}</p>
                <p className="text-xs text-text-muted truncate" dir="ltr">{user.email}</p>
                {user.phone && (
                  <p className="text-xs text-text-secondary tabular-nums" dir="ltr">{user.phone}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Emergency contact (prominent for safety) */}
        <button
          type="button"
          onClick={() => setShowEmergencyModal(true)}
          className="w-full rounded-2xl bg-red-500/10 border-2 border-red-500/40 hover:border-red-500/60 p-4 flex items-center gap-3 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1 text-start">
            <p className="text-sm font-extrabold text-red-400">
              {t.driver?.emergency || 'Emergency'}
            </p>
            <p className="text-xs text-text-muted">
              {emergencyContact || (locale === 'ar' ? 'انقر لإضافة جهة اتصال طوارئ' : locale === 'en' ? 'Tap to add emergency contact' : 'Tippen, um Notfallkontakt hinzuzufügen')}
            </p>
          </div>
          <ChevronRight className={`w-5 h-5 text-red-400 ${isRtl ? 'rotate-180' : ''}`} />
        </button>

        {/* Documents (license, insurance, etc.) */}
        <Link
          href="/driver/documents"
          className="block rounded-2xl bg-bg-elevated border border-edge hover:border-edge-strong p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-red-500/15 text-brand-red-500 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-text">
                {locale === 'ar' ? 'المستندات' : locale === 'en' ? 'Documents' : 'Dokumente'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {locale === 'ar' ? 'الرخصة، التأمين، إلخ' : locale === 'en' ? 'License, insurance, etc.' : 'Führerschein, Versicherung, etc.'}
              </p>
            </div>
            <ChevronRight className={`w-5 h-5 text-text-muted ${isRtl ? 'rotate-180' : ''}`} />
          </div>
        </Link>

        {/* Payouts */}
        <Link
          href="/driver/payouts"
          className="block rounded-2xl bg-bg-elevated border border-edge hover:border-edge-strong p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/15 text-success flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-text">
                {locale === 'ar' ? 'المدفوعات' : locale === 'en' ? 'Payouts' : 'Auszahlungen'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {locale === 'ar' ? 'الأرباح الأسبوعية' : locale === 'en' ? 'Weekly earnings' : 'Wöchentliche Auszahlungen'}
              </p>
            </div>
            <ChevronRight className={`w-5 h-5 text-text-muted ${isRtl ? 'rotate-180' : ''}`} />
          </div>
        </Link>

        {/* Support */}
        <Link
          href="/driver/support"
          className="block rounded-2xl bg-bg-elevated border border-edge hover:border-edge-strong p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-info/15 text-info flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-text">
                {locale === 'ar' ? 'الدعم' : locale === 'en' ? 'Support' : 'Hilfe'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {locale === 'ar' ? 'تواصل مع الدعم' : locale === 'en' ? 'Contact support' : 'Support kontaktieren'}
              </p>
            </div>
            <ChevronRight className={`w-5 h-5 text-text-muted ${isRtl ? 'rotate-180' : ''}`} />
          </div>
        </Link>

        {/* Settings groups */}
        <SettingsGroup title={t.driver?.language || 'Language'}>
          <SettingsRow
            icon={Globe}
            label={t.driver?.language || 'Language'}
            value={locale === 'de' ? t.driver?.german : locale === 'ar' ? t.driver?.arabic : t.driver?.english}
          />
          <div className="grid grid-cols-3 gap-2 p-3">
            {(['de', 'ar', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => handleLanguageChange(l)}
                className={cn(
                  'h-11 rounded-xl text-sm font-extrabold transition-all',
                  locale === l
                    ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow'
                    : 'bg-ink-700 border border-edge text-text-secondary hover:text-white'
                )}
              >
                {l === 'de' ? 'Deutsch' : l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title={t.driver?.notifications || 'Notifications'}>
          <ToggleRow
            icon={pushEnabled ? Bell : BellOff}
            label={t.driver?.pushNotifications || 'Push notifications'}
            description={locale === 'ar' ? 'تنبيهات الطلبات الجديدة' : locale === 'en' ? 'Alerts for new orders' : 'Benachrichtigungen für neue Bestellungen'}
            value={pushEnabled}
            onChange={handlePushToggle}
          />
          <ToggleRow
            icon={soundsEnabled ? Volume2 : VolumeX}
            label={t.driver?.soundEffects || 'Sounds'}
            description={locale === 'ar' ? 'صوت عند وصول طلب جديد' : locale === 'en' ? 'Play sound on new order' : 'Ton bei neuer Bestellung'}
            value={soundsEnabled}
            onChange={handleSoundsToggle}
          />
        </SettingsGroup>

        <SettingsGroup title={t.driver?.navigationProvider || 'Navigation app'}>
          <PickerRow
            icon={NavIcon}
            label={t.driver?.googleMaps || 'Google Maps'}
            selected={navProvider === 'google'}
            onClick={() => handleNavProviderChange('google')}
          />
          <PickerRow
            icon={NavIcon}
            label={t.driver?.appleMaps || 'Apple Maps'}
            selected={navProvider === 'apple'}
            onClick={() => handleNavProviderChange('apple')}
          />
          <PickerRow
            icon={NavIcon}
            label={t.driver?.waze || 'Waze'}
            selected={navProvider === 'waze'}
            onClick={() => handleNavProviderChange('waze')}
          />
        </SettingsGroup>

        <SettingsGroup title={t.driver?.appearance || 'Appearance'}>
          <ThemeRow
            mode="light"
            icon={Sun}
            label={t.driver?.darkMode === 'Dark mode' ? (locale === 'ar' ? 'فاتح' : locale === 'en' ? 'Light' : 'Hell') : (t.driver?.darkMode || 'Dark mode')}
            current={darkMode}
            onClick={() => handleDarkModeChange('light')}
          />
          <ThemeRow
            mode="dark"
            icon={Moon}
            label={t.driver?.darkMode || 'Dark mode'}
            current={darkMode}
            onClick={() => handleDarkModeChange('dark')}
          />
          <ThemeRow
            mode="auto"
            icon={Monitor}
            label={t.driver?.auto || 'Auto'}
            current={darkMode}
            onClick={() => handleDarkModeChange('auto')}
          />
        </SettingsGroup>

        <SettingsGroup title={t.driver?.support || 'Help & support'}>
          <LinkRow icon={HelpCircle} label={t.driver?.helpCenter || 'Help center'} href="/help" />
          <LinkRow icon={Mail} label={t.driver?.contactSupport || 'Contact support'} href="mailto:drivers@blinkgo.de" />
          <LinkRow icon={FileText} label={t.driver?.termsOfService || 'Terms of service'} href="/legal/terms" />
          <LinkRow icon={Shield} label={t.driver?.privacyPolicy || 'Privacy policy'} href="/legal/privacy" />
          <LinkRow icon={Smartphone} label={t.driver?.aboutApp || 'About app'} href="/about" />
        </SettingsGroup>

        <div className="rounded-2xl border border-edge overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full p-4 flex items-center gap-3 hover:bg-ink-700/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="flex-1 text-start text-sm font-extrabold text-red-400">
              {t.driver?.logout || 'Log out'}
            </span>
          </button>
        </div>
      </div>

      {/* Logout confirm modal */}
      {showLogoutConfirm && (
        <Modal onClose={() => setShowLogoutConfirm(false)}>
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 text-red-400 flex items-center justify-center mb-4">
              <LogOut className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-extrabold text-white mb-2">{t.driver?.logoutConfirmTitle || 'Log out?'}</h2>
            <p className="text-sm text-text-muted mb-6">
              {t.driver?.logoutConfirmDesc || 'You can sign back in anytime.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-12 rounded-xl bg-ink-700 text-text-secondary font-bold"
              >
                {locale === 'ar' ? 'إلغاء' : locale === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 h-12 rounded-xl bg-red-500 text-white font-bold"
              >
                {t.driver?.logout || 'Log out'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Emergency contact modal */}
      {showEmergencyModal && (
        <Modal onClose={() => setShowEmergencyModal(false)}>
          <div className="p-6">
            <h2 className="text-lg font-extrabold text-white mb-1">
              {t.driver?.emergency || 'Emergency contact'}
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {locale === 'ar'
                ? 'سيظهر هذا الرقم في قائمة الطوارئ السريعة'
                : locale === 'en'
                ? 'This number will appear in your quick emergency dialer'
                : 'Diese Nummer erscheint in Ihrem Schnell-Notrufwahlmenü'}
            </p>
            <input
              type="tel"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="+49 1577 1234567"
              className="w-full h-12 px-4 rounded-xl bg-ink-700 border border-edge text-white text-base tabular-nums"
              dir="ltr"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                className="flex-1 h-12 rounded-xl bg-ink-700 text-text-secondary font-bold"
              >
                {locale === 'ar' ? 'إلغاء' : locale === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSaveEmergency();
                  setShowEmergencyModal(false);
                }}
                className="flex-1 h-12 rounded-xl bg-red-500 text-white font-bold"
              >
                {locale === 'ar' ? 'حفظ' : locale === 'en' ? 'Save' : 'Speichern'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Settings UI primitives
// ─────────────────────────────────────────────────────────────

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider px-2">
        {title}
      </p>
      <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden divide-y divide-edge">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value?: string;
}) {
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-ink-700 text-text-secondary flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-white">{label}</p>
        {value && <p className="text-xs text-text-muted truncate">{value}</p>}
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: any;
  label: string;
  description?: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="w-full p-4 flex items-center gap-3 hover:bg-ink-700/30 transition-colors"
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
        value ? 'bg-emerald-500/15 text-emerald-400' : 'bg-ink-700 text-text-muted'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 text-start">
        <p className="text-sm font-extrabold text-white">{label}</p>
        {description && <p className="text-xs text-text-muted truncate">{description}</p>}
      </div>
      <div
        className={cn(
          'w-12 h-7 rounded-full transition-colors flex-shrink-0 relative',
          value ? 'bg-emerald-500' : 'bg-ink-700'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'
          )}
        />
      </div>
    </button>
  );
}

function PickerRow({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: any;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full p-4 flex items-center gap-3 transition-colors',
        selected ? 'bg-brand-red-500/10' : 'hover:bg-ink-700/30'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        selected ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white' : 'bg-ink-700 text-text-secondary'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="flex-1 text-start text-sm font-extrabold text-white">{label}</span>
      {selected && <Check className="w-5 h-5 text-brand-red-500" />}
    </button>
  );
}

function ThemeRow({
  mode,
  icon: Icon,
  label,
  current,
  onClick,
}: {
  mode: DarkMode;
  icon: any;
  label: string;
  current: DarkMode;
  onClick: () => void;
}) {
  const selected = current === mode;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full p-4 flex items-center gap-3 transition-colors',
        selected ? 'bg-brand-red-500/10' : 'hover:bg-ink-700/30'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        selected ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white' : 'bg-ink-700 text-text-secondary'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="flex-1 text-start text-sm font-extrabold text-white">{label}</span>
      {selected && <Check className="w-5 h-5 text-brand-red-500" />}
    </button>
  );
}

function LinkRow({
  icon: Icon,
  label,
  href,
}: {
  icon: any;
  label: string;
  href: string;
}) {
  const isExternal = href.startsWith('http') || href.startsWith('mailto:');
  if (isExternal) {
    return (
      <a
        href={href}
        className="w-full p-4 flex items-center gap-3 hover:bg-ink-700/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-ink-700 text-text-secondary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <span className="flex-1 text-start text-sm font-extrabold text-white">{label}</span>
        <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="w-full p-4 flex items-center gap-3 hover:bg-ink-700/30 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-ink-700 text-text-secondary flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <span className="flex-1 text-start text-sm font-extrabold text-white">{label}</span>
      <ChevronRight className="w-4 h-4 text-text-muted rtl:rotate-180" />
    </Link>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-bg-elevated border border-edge shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
