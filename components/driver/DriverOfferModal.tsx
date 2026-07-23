'use client';

/**
 * DriverOfferModal — distraction-free offer acceptance surface.
 *
 * Design:
 * - Massive primary action (88px) at bottom (thumb-friendly)
 * - Earnings prominent at top
 * - Pickup + dropoff visualized on small inline distance markers
 * - Auto-dismisses if no response within timeout (configurable)
 * - Plays audio cue + haptic on appearance
 * - Two clear actions: Accept / Skip — no ambiguity
 */

import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation2, Package, X, Check, Clock, Wallet, TrendingUp } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { haptic } from '@/lib/utils/haptics';
import { playDriverSound } from '@/lib/utils/driver-sound';
import { formatEUR } from '@/lib/format';

export interface DriverOffer {
  id: string;
  order_number: string;
  restaurant_name: string;
  restaurant_address: string;
  delivery_address: string;
  distance_to_restaurant_km: number;
  distance_to_customer_km: number;
  total_eta_min: number;
  payout_eur: number;
  expires_at: string; // ISO
}

interface DriverOfferModalProps {
  offer: DriverOffer;
  onAccept: () => void;
  onSkip: () => void;
  /** Auto-dismiss timeout in seconds. Default 30. */
  timeoutSec?: number;
  busy?: boolean;
}

export function DriverOfferModal({ offer, onAccept, onSkip, timeoutSec = 30, busy }: DriverOfferModalProps) {
  const t = useT();
  const [remaining, setRemaining] = useState(timeoutSec);
  const acceptedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Audio + haptic on mount
  useEffect(() => {
    playDriverSound('offer');
    haptic('heavy');
    startTimeRef.current = Date.now();
  }, []);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const left = Math.max(0, timeoutSec - elapsed);
      setRemaining(left);
      if (left === 0 && !acceptedRef.current) {
        // Auto-skip
        onSkip();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [timeoutSec, onSkip]);

  const handleAccept = () => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    haptic('success');
    playDriverSound('success');
    onAccept();
  };

  const handleSkip = () => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    haptic('warning');
    onSkip();
  };

  const isUrgent = remaining <= 10;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offer-title"
      aria-describedby="offer-desc"
      className="fixed inset-0 z-50 bg-ink-1/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-up">
        {/* Header — earnings + countdown */}
        <div className="px-5 py-4 bg-gradient-to-br from-brand-primary to-brand-premium text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider opacity-90">
              {t.driver?.newOrder ?? 'Neuer Auftrag'}
            </div>
            <div
              className={`
                flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold
                ${isUrgent ? 'bg-white text-danger-700 animate-pulse' : 'bg-white/20'}
              `}
              aria-live="polite"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {remaining}s
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-5xl font-black leading-none">
                {formatEUR(offer.payout_eur)}
              </div>
              <div className="text-sm opacity-90 mt-1">
                {t.driver?.estimatedEarnings ?? 'Garantierte Auszahlung'}
              </div>
            </div>
            <div className="text-end">
              <div className="text-3xl font-bold">
                {offer.total_eta_min}<span className="text-lg">min</span>
              </div>
              <div className="text-xs opacity-90">
                Gesamtdauer
              </div>
            </div>
          </div>
        </div>

        {/* Route preview */}
        <div id="offer-desc" className="px-5 py-4 space-y-3">
          <RoutePoint
            icon={Package}
            label={offer.restaurant_name}
            sublabel={offer.restaurant_address}
            distance={`${offer.distance_to_restaurant_km.toFixed(1)} km`}
            color="text-brand-yellow-600"
          />
          <div className="ms-5 h-6 border-s-2 border-dashed border-ink-3/30" aria-hidden />
          <RoutePoint
            icon={MapPin}
            label={t.driver?.customer ?? 'Kunde'}
            sublabel={offer.delivery_address}
            distance={`${offer.distance_to_customer_km.toFixed(1)} km`}
            color="text-brand-primary"
          />
        </div>

        {/* Actions */}
        <div className="p-4 bg-bg-elevated grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy}
            className="h-16 rounded-2xl bg-bg-card border-2 border-ink-3/30 text-ink-1 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            aria-label={t.driver?.skip_offer ?? 'Auftrag ablehnen'}
          >
            <X className="h-6 w-6" aria-hidden />
            {t.driver?.skip ?? 'Ablehnen'}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="h-16 rounded-2xl bg-gradient-to-r from-tip-500 to-tip-600 text-white font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg disabled:opacity-50"
            aria-label={t.driver?.accept_offer ?? 'Auftrag annehmen'}
          >
            <Check className="h-7 w-7" aria-hidden />
            Annehmen
          </button>
        </div>
      </div>
    </div>
  );
}

function RoutePoint({ icon: Icon, label, sublabel, distance, color }: { icon: any; label: string; sublabel: string; distance: string; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-full bg-bg-elevated ${color}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-1 truncate">{label}</div>
        <div className="text-xs text-ink-2 truncate">{sublabel}</div>
      </div>
      <div className="text-sm font-bold text-ink-1">{distance}</div>
    </div>
  );
}
