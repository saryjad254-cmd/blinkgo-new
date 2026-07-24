'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';

interface Props {
  email?: string;
  role?: string;
  variant?: 'button' | 'icon' | 'menu-item';
}

export function LogoutButton({ email, role, variant = 'button' }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error('Logout failed:', e);
      setLoading(false);
    }
  }

  const label = locale === 'ar' ? 'تسجيل الخروج' : locale === 'de' ? 'Abmelden' : 'Logout';

  if (variant === 'icon') {
    return (
      <button
        onClick={logout}
        disabled={loading}
        className="w-10 h-10 rounded-full bg-surface-elevated hover:bg-surface-light text-white transition-all active:scale-95 inline-flex items-center justify-center"
        title={label}
        aria-label={label}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={logout} loading={loading} icon={<LogOut className="w-4 h-4" />}>
      {label}
    </Button>
  );
}
