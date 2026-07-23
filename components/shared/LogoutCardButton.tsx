'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n/I18nProvider';

interface Props {
  label: string;
  rtl?: boolean;
}

export function LogoutCardButton({ label, rtl }: Props) {
  const router = useRouter();
  const { locale } = useI18n();

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout failed:', e);
    }
    window.location.href = '/';
  }

  return (
    <div
      onClick={handleLogout}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleLogout();
      }}
    >
      <Card hover>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogOut className="w-5 h-5 text-danger" />
            <span className="font-extrabold text-white">{label}</span>
          </div>
          <ArrowRight className={`w-4 h-4 text-text-secondary ${rtl ? 'rotate-180' : ''}`} />
        </div>
      </Card>
    </div>
  );
}
