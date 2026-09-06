'use client';

import Link from 'next/link';
import PackageX from 'lucide-react/dist/esm/icons/package-x';
import { useI18n } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: {
    title: 'Bestellung nicht verfügbar',
    body: 'Diese Bestellung ist nicht dir zugewiesen oder nicht mehr verfügbar.',
    mine: 'Meine Bestellungen',
    available: 'Verfügbare Bestellungen',
  },
  ar: {
    title: 'الطلب غير متاح',
    body: 'هذا الطلب غير مُعيّن لك أو لم يعد متاحاً.',
    mine: 'طلباتي',
    available: 'الطلبات المتاحة',
  },
  en: {
    title: 'Order unavailable',
    body: 'This order is not assigned to you or is no longer available.',
    mine: 'My orders',
    available: 'Available orders',
  },
} as const;

export default function DriverOrderNotFound() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return (
    <main className="grid min-h-[65vh] place-items-center px-4 py-10 text-center" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md rounded-3xl border border-edge bg-bg-elevated p-7 shadow-speed-lg">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-red/10 text-brand-red">
          <PackageX className="size-8" />
        </span>
        <h1 className="mt-5 text-xl font-black text-text">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{copy.body}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link href="/driver/orders" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-red px-4 text-sm font-extrabold text-white">
            {copy.mine}
          </Link>
          <Link href="/driver/orders/available" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-edge bg-bg px-4 text-sm font-extrabold text-text">
            {copy.available}
          </Link>
        </div>
      </div>
    </main>
  );
}
