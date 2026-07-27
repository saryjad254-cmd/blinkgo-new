'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Check from 'lucide-react/dist/esm/icons/check';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useToast } from '@/components/ui/Toast';

export function AcceptOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  // v82 fix: prevent double-tap (which previously sent two parallel
  // updates via the browser Supabase client, sometimes both succeeding
  // against the RLS-bypassed update).
  const inFlightRef = useRef(false);

  async function handleAccept() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      // v82 fix: route through the SECURED /api/driver/orders/[id]/accept
      // endpoint instead of writing directly to the orders table from the
      // browser. The previous implementation:
      //   1. Bypassed the withSecurity wrapper (no role check, no audit,
      //      no online-status verification)
      //   2. Set status = 'picked_up' which is WRONG — the driver hasn't
      //      picked up the food yet, the order should stay in
      //      confirmed/preparing/ready and the driver transitions to
      //      'picked_up' only after grabbing the food at the restaurant
      //   3. Was a double-click race (no in-flight guard)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(`/api/driver/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg = json?.error?.message || json?.error || (
          res.status === 409
            ? (locale === 'ar' ? 'تم قبول الطلب من سائق آخر' : locale === 'en' ? 'Order already taken' : 'Bereits von einem anderen Fahrer angenommen')
            : (locale === 'ar' ? 'فشل قبول الطلب' : locale === 'en' ? 'Could not accept order' : 'Annahme fehlgeschlagen')
        );
        throw new Error(msg);
      }
      router.push(`/driver/orders/${orderId}`);
      router.refresh();
    } catch (err: any) {
      // v82: always use the app toast — never block the driver with a
      // native alert() in the middle of an accept action.
      toastError(err?.message ?? (locale === 'ar' ? 'فشل قبول الطلب' : 'Failed to accept order'));
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  return (
    <button
      onClick={handleAccept}
      disabled={loading}
      className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <Check className="w-4 h-4" />
          {locale === 'ar' ? 'قبول' : locale === 'en' ? 'Accept' : 'Annehmen'}
        </>
      )}
    </button>
  );
}
