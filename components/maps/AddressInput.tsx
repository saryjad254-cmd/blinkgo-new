'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapPin, Navigation, X, Loader2, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface PlacePrediction {
  description: string;
  placeId: string;
  mainText: string;
  secondaryText: string;
}

interface Props {
  /** Initial address text */
  value?: string;
  /** Pre-resolved lat/lng */
  lat?: number | null;
  lng?: number | null;
  /** Called whenever the user picks a prediction or finishes editing */
  onChange: (selection: {
    address: string;
    lat: number;
    lng: number;
    placeId?: string;
  }) => void;
  /** Disable interaction */
  disabled?: boolean;
  /** Custom placeholder */
  placeholder?: string;
  /** Visual variant */
  variant?: 'default' | 'large';
  /** Show GPS button to use current location */
  showCurrentLocation?: boolean;
  /** Allow custom (non-prediction) addresses */
  allowCustom?: boolean;
  /** Optional className */
  className?: string;
  /** Error text */
  error?: string;
  /** aria-label override */
  ariaLabel?: string;
}

/**
 * AddressInput
 * ────────────
 * Production-grade address autocomplete input.
 *
 * - Calls /api/maps/autocomplete for predictions (server-side, key never leaks)
 * - Calls /api/maps/geocode to resolve a chosen prediction to lat/lng
 * - Shows a "Use current location" button
 * - Keyboard accessible (↑/↓/Enter/Esc)
 * - Click-outside dismisses suggestions
 * - Debounced 250ms
 * - Renders correctly in RTL (Arabic)
 */
export function AddressInput({
  value = '',
  lat: propLat,
  lng: propLng,
  onChange,
  disabled,
  placeholder,
  variant = 'default',
  showCurrentLocation = true,
  allowCustom = true,
  className,
  error,
  ariaLabel,
}: Props) {
  const { locale } = useI18n();
  const [input, setInput] = useState(value);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(
    propLat != null && propLng != null ? { lat: propLat, lng: propLng } : null
  );
  const [resolvedText, setResolvedText] = useState<string | null>(value || null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionTokenRef = useRef<string>('');

  // Init session token once
  useEffect(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (value !== undefined && value !== input) {
      setInput(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (propLat != null && propLng != null) {
      setResolved({ lat: propLat, lng: propLng });
    }
  }, [propLat, propLng]);

  // Debounced fetch of suggestions
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.length < 3) {
      setPredictions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/maps/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'autocomplete', input: trimmed }),
        });
        const data = await res.json();
        if (cancelled) return;
        setPredictions(data?.data?.predictions ?? []);
        setActiveIndex(-1);
      } catch {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [input]);

  // Click outside closes suggestions
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Resolve a chosen prediction
  const resolveAndEmit = useCallback(
    async (pred: PlacePrediction) => {
      setLoading(true);
      try {
        const res = await fetch('/api/maps/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'geocode', address: pred.description }),
        });
        const data = await res.json();
        if (data?.ok && data?.data) {
          setInput(pred.description);
          setResolved({ lat: data.data.lat, lng: data.data.lng });
          setResolvedText(pred.description);
          setShowSuggestions(false);
          onChange({
            address: pred.description,
            lat: data.data.lat,
            lng: data.data.lng,
            placeId: pred.placeId,
          });
        }
      } catch {
        // keep the suggestion visible
      } finally {
        setLoading(false);
      }
    },
    [onChange]
  );

  // Use current GPS location
  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Reverse-geocode to a human address
          const res = await fetch('/api/maps/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reverse', lat: latitude, lng: longitude }),
          });
          const data = await res.json();
          const address = data?.ok ? data.data.formattedAddress : 'Aktueller Standort';
          setInput(address);
          setResolved({ lat: latitude, lng: longitude });
          setResolvedText(address);
          setShowSuggestions(false);
          onChange({ address, lat: latitude, lng: longitude });
        } catch {
          setInput('Aktueller Standort');
          setResolved({ lat: latitude, lng: longitude });
          setShowSuggestions(false);
          onChange({ address: 'Aktueller Standort', lat: latitude, lng: longitude });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        // Best-effort alert in user's language
        const msg =
          locale === 'ar'
            ? 'لا يمكن الوصول إلى الموقع. يرجى التحقق من الأذونات.'
            : locale === 'en'
            ? 'Cannot access your location. Please check permissions.'
            : 'Standort nicht verfügbar. Bitte Berechtigungen prüfen.';
        // eslint-disable-next-line no-console
        console.warn('[AddressInput] Geolocation error:', err.message);
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  }, [locale, onChange]);

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && predictions[activeIndex]) {
          e.preventDefault();
          resolveAndEmit(predictions[activeIndex]);
        } else if (allowCustom && input.trim().length >= 5) {
          // Free-form fallback
          e.preventDefault();
          (async () => {
            setLoading(true);
            const res = await fetch('/api/maps/geocode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'geocode', address: input.trim() }),
            });
            const data = await res.json();
            setLoading(false);
            if (data?.ok && data?.data) {
              setResolved({ lat: data.data.lat, lng: data.data.lng });
              setResolvedText(input.trim());
              setShowSuggestions(false);
              onChange({
                address: input.trim(),
                lat: data.data.lat,
                lng: data.data.lng,
              });
            }
          })();
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [activeIndex, predictions, resolveAndEmit, allowCustom, input, onChange]
  );

  const labels = useMemo(
    () => ({
      placeholder:
        placeholder ??
        (locale === 'ar'
          ? 'أدخل عنوان التوصيل'
          : locale === 'en'
          ? 'Enter delivery address'
          : 'Lieferadresse eingeben'),
      useCurrent:
        locale === 'ar' ? 'استخدم موقعي الحالي' : locale === 'en' ? 'Use my current location' : 'Meinen Standort verwenden',
      geocoded:
        locale === 'ar' ? 'تم التحقق من الموقع' : locale === 'en' ? 'Location verified' : 'Standort bestätigt',
    }),
    [locale, placeholder]
  );

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <div
        className={cn(
          'relative flex items-center gap-2',
          variant === 'large'
            ? 'h-14 rounded-2xl bg-ink-800 border border-edge-light focus-within:border-brand-red-500'
            : 'h-12 rounded-pill bg-ink-800 border border-edge-light focus-within:border-brand-red-500',
          'px-3.5 transition-colors',
          error && 'border-red-500/60',
          disabled && 'opacity-60 pointer-events-none'
        )}
      >
        <MapPin className="w-4 h-4 text-text-muted flex-shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            if (resolved) {
              setResolved(null); // user is editing
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={onKeyDown}
          placeholder={labels.placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? labels.placeholder}
          autoComplete="off"
          dir="auto"
          className="flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder:text-text-muted"
        />

        {loading && <Loader2 className="w-4 h-4 text-text-muted animate-spin flex-shrink-0" />}

        {resolved && !loading && (
          <span title={labels.geocoded}>
            <Check className="w-4 h-4 text-success flex-shrink-0" />
          </span>
        )}

        {input && !loading && !resolved && (
          <button
            type="button"
            onClick={() => {
              setInput('');
              setPredictions([]);
              setResolved(null);
            }}
            className="text-text-muted hover:text-white flex-shrink-0"
            aria-label="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {showCurrentLocation && (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-brand-red-500/15 text-brand-red-500 hover:bg-brand-red-500/25 flex items-center justify-center transition-colors"
            aria-label={labels.useCurrent}
            title={labels.useCurrent}
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mt-1.5 px-1">{error}</p>}

      {resolved && (
        <p className="text-[11px] text-text-muted mt-1.5 px-1 font-mono" dir="ltr">
          {resolved.lat.toFixed(5)}, {resolved.lng.toFixed(5)}
        </p>
      )}

      {showSuggestions && predictions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full inset-x-0 mt-1.5 z-50 max-h-72 overflow-y-auto rounded-2xl bg-ink-800 border border-edge-light shadow-2xl shadow-black/40"
        >
          {predictions.map((p, i) => (
            <li
              key={p.placeId}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                // mousedown to fire before input blur
                e.preventDefault();
                resolveAndEmit(p);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex items-start gap-2 px-3.5 py-2.5 cursor-pointer border-b border-edge-light last:border-0 transition-colors',
                i === activeIndex ? 'bg-brand-red-500/15' : 'hover:bg-ink-700'
              )}
            >
              <MapPin className="w-4 h-4 mt-0.5 text-brand-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.mainText}</p>
                {p.secondaryText && (
                  <p className="text-[11px] text-text-muted truncate">{p.secondaryText}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
