'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UsersRound from 'lucide-react/dist/esm/icons/users-round';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';

export function StartGroupOrderButton({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const label = locale === 'ar' ? 'طلب جماعي' : locale === 'en' ? 'Group order' : 'Gruppenbestellung';

  async function start() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch('/api/group-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: restaurantId }) });
      const payload = await response.json().catch(() => ({}));
      const data = payload.data;
      if (!response.ok || !data?.group?.id || !data?.invite_token) throw new Error('create_failed');
      sessionStorage.setItem(`blinkgo-group-invite:${data.group.id}`, data.invite_token);
      router.push(`/group-order/${data.group.id}`);
    } catch {
      toast.error(locale === 'ar' ? 'تعذر إنشاء الطلب الجماعي.' : locale === 'en' ? 'Could not create the group order.' : 'Gruppenbestellung konnte nicht erstellt werden.');
      setPending(false);
    }
  }

  return <button type="button" data-testid="start-group-order" onClick={start} disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 text-sm font-black text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : <UsersRound className="size-4" />}{label}</button>;
}
