'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Star, X, Loader2, MessageSquare, Utensils, Truck, Send, Sparkles } from 'lucide-react';
import { useT, safeT } from '@/lib/i18n/I18nProvider';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

interface RatingData {
  food?: number;
  restaurant?: number;
  driver?: number;
  comment?: string;
}

interface RateOrderModalProps {
  orderId: string;
  orderNumber: string;
  restaurantId?: string;
  driverId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  locale?: 'de' | 'ar' | 'en';
}

/**
 * RateOrderModal
 * ──────────────
 * Premium, world-class post-delivery review modal.
 *
 * - 3 separate rating dimensions (food, restaurant, driver) — DoorDash/Uber style
 * - 5-star selector with hover-preview and emoji-style feedback
 * - Optional free-text comment
 * - Anonymous by default for driver
 * - Saves to `public.ratings` table
 * - One-tap dismissal on submit
 */
export function RateOrderModal({
  orderId,
  orderNumber,
  restaurantId,
  driverId,
  isOpen,
  onClose,
  onSubmitted,
  locale: localeProp,
}: RateOrderModalProps) {
  const t = useT();
  const detected = (t as any)?.customer?.orderNumber ? (t as any) : null;
  const loc = (localeProp ?? (detected && 'ar' in detected ? 'ar' : 'de')) as 'ar' | 'de' | 'en';

  const [rating, setRating] = useState<RatingData>({});
  const [hoveredFood, setHoveredFood] = useState(0);
  const [hoveredRestaurant, setHoveredRestaurant] = useState(0);
  const [hoveredDriver, setHoveredDriver] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3-locale labels
  const labels = {
    title:
      loc === 'ar' ? 'كيف كانت تجربتك؟' : loc === 'en' ? 'How was your experience?' : 'Wie war dein Erlebnis?',
    subtitle:
      loc === 'ar'
        ? `طلب #${orderNumber} • ساعدنا في التحسين`
        : loc === 'en'
        ? `Order #${orderNumber} • Help us improve`
        : `Bestellung #${orderNumber} • Hilf uns besser zu werden`,
    foodQ: loc === 'ar' ? 'الطعم' : loc === 'en' ? 'Food quality' : 'Essensqualität',
    foodSubtitle:
      loc === 'ar' ? 'كيف كان الطعم؟' : loc === 'en' ? 'How was the taste?' : 'Wie hat es geschmeckt?',
    restQ: loc === 'ar' ? 'المطعم' : loc === 'en' ? 'Restaurant' : 'Restaurant',
    restSubtitle:
      loc === 'ar' ? 'تقييم تجربتك في المطعم' : loc === 'en' ? 'Rate the restaurant' : 'Bewerte das Restaurant',
    driverQ: loc === 'ar' ? 'السائق' : loc === 'en' ? 'Driver' : 'Fahrer',
    driverSubtitle:
      loc === 'ar' ? 'تقييم توصيل الطلب' : loc === 'en' ? 'Rate the delivery' : 'Bewerte die Lieferung',
    ratingLabels: {
      1: loc === 'ar' ? 'سيء' : loc === 'en' ? 'Poor' : 'Schlecht',
      2: loc === 'ar' ? 'مقبول' : loc === 'en' ? 'Okay' : 'Geht so',
      3: loc === 'ar' ? 'جيد' : loc === 'en' ? 'Good' : 'Gut',
      4: loc === 'ar' ? 'ممتاز' : loc === 'en' ? 'Great' : 'Sehr gut',
      5: loc === 'ar' ? 'رائع' : loc === 'en' ? 'Amazing' : 'Fantastisch',
    },
    optional:
      loc === 'ar' ? 'اختياري' : loc === 'en' ? 'Optional' : 'Optional',
    commentPlaceholder:
      loc === 'ar' ? 'شاركنا تجربتك (اختياري)...' : loc === 'en' ? 'Share your experience (optional)...' : 'Erzähle uns von deiner Erfahrung (optional)...',
    submit: loc === 'ar' ? 'إرسال التقييم' : loc === 'en' ? 'Submit review' : 'Bewertung absenden',
    submitting: loc === 'ar' ? 'جاري الإرسال...' : loc === 'en' ? 'Submitting...' : 'Wird gesendet...',
    skip: loc === 'ar' ? 'تقييم لاحقاً' : loc === 'en' ? 'Rate later' : 'Später bewerten',
    thanks:
      loc === 'ar' ? 'شكراً لتقييمك!' : loc === 'en' ? 'Thanks for your feedback!' : 'Danke für deine Bewertung!',
    thanksSub:
      loc === 'ar' ? 'سيتم نشر تعليقك في قسم التقييمات قريباً'
        : loc === 'en' ? 'Your review will appear on the restaurant page soon'
        : 'Deine Bewertung erscheint bald auf der Restaurant-Seite',
    close: loc === 'ar' ? 'إغلاق' : loc === 'en' ? 'Close' : 'Schließen',
    required:
      loc === 'ar' ? 'يرجى تقييم المطعم' : loc === 'en' ? 'Please rate the restaurant' : 'Bitte bewerte das Restaurant',
  };

  const handleSubmit = useCallback(async () => {
    if (!rating.restaurant) {
      setError(labels.required);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError(loc === 'ar' ? 'يجب تسجيل الدخول' : loc === 'en' ? 'Must be logged in' : 'Bitte einloggen');
        setSubmitting(false);
        return;
      }
      const { error: insertErr } = await supabase.from('ratings').insert({
        order_id: orderId,
        customer_id: user.id,
        restaurant_id: restaurantId ?? null,
        driver_id: driverId ?? null,
        restaurant_rating: rating.restaurant,
        food_rating: rating.food ?? null,
        driver_rating: rating.driver ?? null,
        comment: rating.comment?.trim() || null,
      });
      if (insertErr) {
        // 23505 = unique violation (already rated)
        if (insertErr.code === '23505') {
          setSuccess(true);
          setTimeout(() => {
            onSubmitted?.();
            onClose();
          }, 1800);
          return;
        }
        throw insertErr;
      }
      setSuccess(true);
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 1800);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to submit');
      setSubmitting(false);
    }
  }, [rating, orderId, restaurantId, driverId, onSubmitted, onClose, labels, loc]);

  useEffect(() => {
    if (isOpen) {
      setRating({});
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-[fadeIn_200ms_ease-out]"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-bg border border-edge shadow-speed-xl animate-[slideUp_300ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
        dir={loc === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Background glow */}
        <div
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-brand-500/20 blur-3xl"
          aria-hidden
        />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-surface border border-edge text-text-muted hover:text-white hover:border-brand-500/60 active:scale-95 transition-all flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? (
          <SuccessState
            title={labels.thanks}
            subtitle={labels.thanksSub}
            closeLabel={labels.close}
            onClose={onClose}
          />
        ) : (
          <div className="relative p-6 sm:p-7 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-brand-gradient items-center justify-center shadow-glow">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold text-white">{labels.title}</h2>
              <p className="text-sm text-text-secondary">{labels.subtitle}</p>
            </div>

            {/* Three rating dimensions */}
            <div className="space-y-4">
              <RatingRow
                icon={<Utensils className="w-4 h-4" />}
                accent="accent"
                question={labels.foodQ}
                subtitle={labels.foodSubtitle}
                value={rating.food ?? 0}
                hovered={hoveredFood}
                onChange={(v) => setRating((r) => ({ ...r, food: v }))}
                onHover={setHoveredFood}
                labels={labels.ratingLabels}
                locale={loc}
                required={false}
              />
              <RatingRow
                icon={<MessageSquare className="w-4 h-4" />}
                accent="brand"
                question={labels.restQ}
                subtitle={labels.restSubtitle}
                value={rating.restaurant ?? 0}
                hovered={hoveredRestaurant}
                onChange={(v) => setRating((r) => ({ ...r, restaurant: v }))}
                onHover={setHoveredRestaurant}
                labels={labels.ratingLabels}
                locale={loc}
                required
              />
              {driverId && (
                <RatingRow
                  icon={<Truck className="w-4 h-4" />}
                  accent="cyan"
                  question={labels.driverQ}
                  subtitle={labels.driverSubtitle}
                  value={rating.driver ?? 0}
                  hovered={hoveredDriver}
                  onChange={(v) => setRating((r) => ({ ...r, driver: v }))}
                  onHover={setHoveredDriver}
                  labels={labels.ratingLabels}
                  locale={loc}
                  required={false}
                />
              )}
            </div>

            {/* Comment textarea */}
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">
                {loc === 'ar' ? 'تعليقك' : loc === 'en' ? 'Your comment' : 'Dein Kommentar'}{' '}
                <span className="text-text-muted opacity-60">— {labels.optional}</span>
              </label>
              <textarea
                value={rating.comment ?? ''}
                onChange={(e) => setRating((r) => ({ ...r, comment: e.target.value }))}
                placeholder={labels.commentPlaceholder}
                rows={3}
                className="w-full px-4 py-3 rounded-2xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-danger font-medium px-3 py-2 rounded-xl bg-danger/10 border border-danger/30">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="h-12 rounded-2xl bg-surface border border-edge text-text-secondary font-bold text-sm hover:text-white hover:border-edge-strong active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {labels.skip}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !rating.restaurant}
                className={cn(
                  'h-12 rounded-2xl bg-brand-gradient text-white font-extrabold text-sm',
                  'flex items-center justify-center gap-2',
                  'shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5',
                  'active:scale-[0.97] transition-all duration-200 ease-silk',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {labels.submitting}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {labels.submit}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RatingRowProps {
  icon: React.ReactNode;
  accent: 'brand' | 'accent' | 'cyan';
  question: string;
  subtitle: string;
  value: number;
  hovered: number;
  onChange: (v: number) => void;
  onHover: (v: number) => void;
  labels: Record<number, string>;
  locale: 'de' | 'ar' | 'en';
  required?: boolean;
}

function RatingRow({
  icon,
  accent,
  question,
  subtitle,
  value,
  hovered,
  onChange,
  onHover,
  labels,
  locale,
  required,
}: RatingRowProps) {
  const accentBg = {
    brand: 'bg-brand-gradient',
    accent: 'bg-accent-500',
    cyan: 'bg-live-gradient',
  }[accent];
  const display = hovered || value;

  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-glow',
            accentBg,
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-white">
            {question}
            {required && <span className="text-danger ms-1">*</span>}
          </p>
          <p className="text-xs text-text-secondary">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => onHover(n)}
            onMouseLeave={() => onHover(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="group flex-1 h-12 rounded-xl hover:bg-surface-light active:scale-95 transition-all"
          >
            <Star
              className={cn(
                'w-7 h-7 mx-auto transition-all duration-200',
                display >= n
                  ? 'fill-yellow-400 text-brand-yellow-400 scale-110'
                  : 'text-text-muted group-hover:text-brand-yellow-400/50',
                locale === 'ar' ? 'rotate-180' : '',
              )}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>

      {display > 0 && (
        <p className="text-xs font-bold text-center text-accent-400">
          {labels[display]}
        </p>
      )}
    </div>
  );
}

function SuccessState({
  title,
  subtitle,
  closeLabel,
  onClose,
}: {
  title: string;
  subtitle: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="relative p-10 text-center space-y-4 animate-[fadeIn_300ms_ease-out]">
      <div className="inline-flex w-20 h-20 rounded-full bg-tip-gradient items-center justify-center shadow-glow-success animate-[pop_400ms_ease-out]">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-white">{title}</h2>
        <p className="text-sm text-text-secondary mt-2">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="h-12 px-6 rounded-2xl bg-tip-gradient text-white font-extrabold text-sm shadow-glow-success hover:-translate-y-0.5 active:scale-[0.97] transition-all"
      >
        {closeLabel}
      </button>
    </div>
  );
}
