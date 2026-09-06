'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import UsersRound from 'lucide-react/dist/esm/icons/users-round';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function JoinGroupOrderPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const c = locale === 'ar'
    ? { title: 'انضم إلى الطلب الجماعي', sub: 'اختر الاسم الذي سيراه المضيف بجانب طلبك.', name: 'اسمك', join: 'انضم الآن', failed: 'الرابط غير صالح أو تم إغلاق الطلب.' }
    : locale === 'en'
      ? { title: 'Join the group order', sub: 'Choose the name the host will see next to your items.', name: 'Your name', join: 'Join now', failed: 'This link is invalid or the order is already closed.' }
      : { title: 'Gruppenbestellung beitreten', sub: 'Wähle den Namen, den der Gastgeber neben deinen Artikeln sieht.', name: 'Dein Name', join: 'Jetzt beitreten', failed: 'Dieser Link ist ungültig oder die Bestellung ist bereits geschlossen.' };

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true); setError('');
    const response = await fetch('/api/group-orders/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, display_name: name }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.data?.group_id) { setError(c.failed); setPending(false); return; }
    router.replace(payload.data.redirect);
  }

  return <main data-testid="group-order-join" dir={locale === 'ar' ? 'rtl' : 'ltr'} className="grid min-h-[calc(100vh-5rem)] place-items-center bg-[#080808] p-4 text-white"><form onSubmit={join} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,0,.2),transparent_45%),#121214] p-6 shadow-2xl"><span className="grid size-14 place-items-center rounded-2xl bg-amber-300/10 text-amber-300"><UsersRound className="size-7" /></span><h1 className="mt-5 text-2xl font-black">{c.title}</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{c.sub}</p><label className="mt-6 block text-sm font-bold">{c.name}<input data-testid="group-join-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" /></label>{error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<button data-testid="group-join-submit" disabled={pending || !name.trim()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 font-black disabled:opacity-50">{pending && <Loader2 className="size-4 animate-spin" />}{c.join}</button></form></main>;
}
