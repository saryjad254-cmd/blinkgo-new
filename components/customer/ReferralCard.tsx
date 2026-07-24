'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';

import { Users, Copy, Check, Send, Gift, Mail } from 'lucide-react';

interface Referral {
  id: string;
  referee_email: string;
  status: 'pending' | 'signed_up' | 'completed' | 'rewarded';
  created_at: string;
  completed_at: string | null;
}

export function ReferralCard() {
  const t = useT();
  const [code, setCode] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [codeRes, listRes] = await Promise.all([
        fetch('/api/referrals?action=code'),
        fetch('/api/referrals?action=list'),
      ]);
      const [codeData, listData] = await Promise.all([codeRes.json(), listRes.json()]);
      if (codeData.ok) setCode(codeData.data.code);
      if (listData.ok) setReferrals(listData.data.referrals);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareVia = (channel: 'whatsapp' | 'email' | 'sms') => {
    const text = encodeURIComponent(
      `Hey! Try BlinkGo using my code ${code} and you both get rewarded. ${window.location.origin}/register?ref=${code}`,
    );
    if (channel === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (channel === 'email') window.location.href = `mailto:?subject=Try BlinkGo&body=${text}`;
    if (channel === 'sms') window.location.href = `sms:?body=${text}`;
  };

  const sendInvite = async () => {
    if (!email) return;
    setSending(true);
    try {
      await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referee_email: email }),
      });
      setEmail('');
      setShowInvite(false);
      loadData();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-12 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-racing-red via-racing-red to-golden-yellow p-6 text-white shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_50%)]" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Gift className="h-6 w-6" />
          <h3 className="text-lg font-bold">{t.referral.title}</h3>
        </div>
        <p className="mt-1 text-sm text-white/90">{t.referral.subtitle}</p>

        <div className="mt-5 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wider text-white/80">
            {t.referral.yourCode}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-white/20 px-4 py-3 font-mono text-2xl font-black tracking-widest">
              {code || '—'}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-xl bg-white px-4 py-3 text-racing-red transition hover:bg-white/90"
              aria-label={t.referral.copy}
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-xs font-bold text-white"
            >
              {t.referral.copied}
            </motion.div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => shareVia('whatsapp')}
            className="rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold transition hover:bg-emerald-600"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => shareVia('email')}
            className="rounded-xl bg-white/20 py-2.5 text-sm font-semibold transition hover:bg-white/30"
          >
            {t.referral.send}
          </button>
          <button
            type="button"
            onClick={() => shareVia('sms')}
            className="rounded-xl bg-white/20 py-2.5 text-sm font-semibold transition hover:bg-white/30"
          >
            SMS
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowInvite(!showInvite)}
          className="mt-3 w-full rounded-xl border border-white/30 bg-transparent py-2.5 text-sm font-semibold transition hover:bg-white/10"
        >
          <Mail className="me-2 inline h-4 w-4" />
          {t.referral.inviteFriend}
        </button>

        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.referral.friendEmail}
                  className="flex-1 rounded-xl bg-white/20 px-4 py-2.5 text-sm text-white placeholder-white/60 outline-none focus:bg-white/30"
                />
                <button
                  type="button"
                  onClick={sendInvite}
                  disabled={sending || !email}
                  className="rounded-xl bg-white px-4 py-2.5 text-racing-red transition hover:bg-white/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {referrals.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="text-xs uppercase tracking-wider text-white/80">
              {t.referral.referrals}
            </div>
            {referrals.slice(0, 3).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-white/10 p-2.5 text-sm"
              >
                <span className="truncate">{r.referee_email}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    r.status === 'rewarded' || r.status === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {r.status === 'rewarded' || r.status === 'completed'
                    ? t.referral.completed
                    : t.referral.pending}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
