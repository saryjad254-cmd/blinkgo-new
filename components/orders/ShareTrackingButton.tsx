'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useState } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';

import { Share2, Copy, Check, X } from 'lucide-react';

interface ShareTrackingButtonProps {
  orderId: string;
  restaurantName?: string;
}

export function ShareTrackingButton({ orderId, restaurantName }: ShareTrackingButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: 'order',
          resource_id: orderId,
          expires_in_hours: 24,
        }),
      });
      const data = await res.json();
      if (data.ok) setShareUrl(data.data.url);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareVia = (channel: 'whatsapp' | 'email' | 'sms') => {
    if (!shareUrl) return;
    const text = encodeURIComponent(
      restaurantName
        ? `Track my ${restaurantName} order on BlinkGo: ${shareUrl}`
        : `Track my BlinkGo order: ${shareUrl}`,
    );
    if (channel === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (channel === 'email') window.location.href = `mailto:?subject=My BlinkGo order&body=${text}`;
    if (channel === 'sms') window.location.href = `sms:?body=${text}`;
  };

  const open_ = () => {
    setOpen(!open);
    if (!open && !shareUrl) generateLink();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={open_}
        className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-ink-1 transition hover:border-ink-2 hover:bg-ink-2/5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <Share2 className="h-4 w-4" />
        {t.share.shareTracking}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            className="absolute end-0 z-50 mt-2 w-80 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-bold text-ink-1 dark:text-zinc-100">{t.share.title}</h4>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="py-4 text-center text-sm text-zinc-500">...</div>
            ) : shareUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 min-w-0 truncate rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <button
                    onClick={copyLink}
                    className="rounded-lg bg-ink-1 p-2 text-white transition hover:bg-ink-2"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                {copied && (
                  <div className="mt-1 text-xs text-emerald-600">{t.share.copied}</div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button onClick={() => shareVia('whatsapp')} className="rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                    WhatsApp
                  </button>
                  <button onClick={() => shareVia('email')} className="rounded-lg bg-ink-2 py-2 text-xs font-semibold text-white hover:bg-ink-2/90">
                    Email
                  </button>
                  <button onClick={() => shareVia('sms')} className="rounded-lg bg-zinc-200 py-2 text-xs font-semibold text-ink-1 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100">
                    SMS
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">{t.share.expiresIn} 24 {t.share.hours}</div>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
