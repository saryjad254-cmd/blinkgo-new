'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Copy,
  Phone,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Crosshair,
  Loader2,
  AlertTriangle,
  Copy as CopyIcon,
} from 'lucide-react';
import { useT, safeT } from '@/lib/i18n/I18nProvider';
import { googleMapsUrl, googleMapsDirectionsUrl } from '@/lib/maps/google-maps';
import { cn } from '@/lib/cn';

export interface DeliveryAddress {
  /** Display address (e.g. "Sechtemer Str. 2, 53332 Bornheim") */
  address: string;
  /** Street / building */
  street?: string;
  /** City */
  city?: string;
  /** Postal code */
  postal?: string;
  /** Country */
  country?: string;
  /** Floor / apartment number */
  floor?: string;
  door?: string;
  /** Driver instructions */
  instructions?: string;
  /** Lat / Lng */
  lat?: number | null;
  lng?: number | null;
  /** Contact name + phone */
  contactName?: string;
  contactPhone?: string;
}

interface Props {
  /** The address object or string */
  address: string | DeliveryAddress;
  /** Optional pre-resolved GPS (overrides address.lat/lng) */
  lat?: number | null;
  lng?: number | null;
  /** Optional contact info */
  contactName?: string;
  contactPhone?: string;
  /** Optional driver instructions (e.g. "Leave at door") */
  instructions?: string;
  /** Street (when passing as separate fields) */
  street?: string;
  /** City */
  city?: string;
  /** Postal code */
  postal?: string;
  /** Country */
  country?: string;
  /** Floor / apartment for delivery */
  floor?: string;
  door?: string;
  /** Origin coords for "directions from" button (e.g. driver location) */
  directionsFrom?: { lat: number; lng: number } | null;
  /** Visual theme */
  variant?: 'customer' | 'restaurant' | 'driver' | 'default';
  /** Show call / directions buttons */
  showNavigation?: boolean;
  showPhone?: boolean;
  /** Compact mode (less padding) */
  compact?: boolean;
  /** Override the title shown above the address */
  title?: string;
  /** Whether to auto-truncate + expand (default true) */
  expandable?: boolean;
  /** Where to send "open in maps" link by default */
  mapProvider?: 'google' | 'apple';
}

/**
 * DeliveryAddressCard
 * ────────────────────
 * Unified, never-truncated, always-visible delivery address card.
 *
 * Guarantees:
 * - **Always visible**: one of the most prominent elements on every order screen.
 * - **Never truncated wrong**: long addresses are wrapped; "expand" toggles
 *    the compact 1-line view. "Always show full address" is the default.
 * - **Single source of truth**: every order page (customer / driver / restaurant
 *    / admin) uses this component, so layout, typography, and Maps link are
 *    always identical.
 * - **Copy-to-clipboard** with success state.
 * - **Always-on Google Maps** link (no truncation / no geocoding required).
 * - **One-tap directions** if directionsFrom is provided.
 */
export function DeliveryAddressCard({
  address: rawAddress,
  lat: propLat,
  lng: propLng,
  contactName,
  contactPhone,
  instructions,
  street: propStreet,
  city: propCity,
  postal: propPostal,
  country: propCountry,
  floor,
  door,
  directionsFrom,
  variant = 'default',
  showNavigation = true,
  showPhone = true,
  compact = false,
  title,
  expandable = true,
  mapProvider = 'google',
}: Props) {
  const t = useT();
  // Normalize incoming address (string or object)
  const addr: DeliveryAddress = useMemo(() => {
    if (typeof rawAddress === 'string') {
      // Try to parse the string into structured parts
      const parsed = parseAddressString(rawAddress, { floor, door, instructions });
      // Allow explicit props to override parsed values
      return {
        ...parsed,
        street: propStreet ?? parsed.street,
        city: propCity ?? parsed.city,
        postal: propPostal ?? parsed.postal,
        country: propCountry ?? parsed.country,
      };
    }
    return { ...rawAddress, floor, door, instructions, contactName, contactPhone };
  }, [rawAddress, propStreet, propCity, propPostal, propCountry, floor, door, instructions, contactName, contactPhone]);

  const lat = propLat ?? addr.lat ?? null;
  const lng = propLng ?? addr.lng ?? null;
  const phone = contactPhone ?? addr.contactPhone ?? null;
  const name = contactName ?? addr.contactName ?? null;

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const addressRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Detect if address text overflows (long addresses can wrap to 2+ lines)
  useEffect(() => {
    if (!addressRef.current || !expandable) return;
    const el = addressRef.current;
    setIsOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [addr.address, expandable, compact]);

  // Auto-expand when not expandable so user always sees the full address
  const showFull = !expandable || expanded;

  const copyToClipboard = useCallback(async () => {
    if (!addr.address) return;
    try {
      await navigator.clipboard.writeText(addr.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }, [addr.address]);

  if (!addr.address) return null;

  // Build the Google Maps URL
  const mapsUrl = useMemo(() => {
    if (lat != null && lng != null) {
      return googleMapsUrl(lat, lng, addr.address);
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.address)}`;
  }, [lat, lng, addr.address]);

  const directionsUrl = useMemo(() => {
    if (lat != null && lng != null && directionsFrom) {
      return googleMapsDirectionsUrl(
        directionsFrom.lat,
        directionsFrom.lng,
        lat,
        lng,
        'driving',
      );
    }
    return null;
  }, [lat, lng, directionsFrom]);

  // Variant colors
  const theme = useMemo(() => {
    switch (variant) {
      case 'customer':
        return {
          ring: 'ring-success/40',
          iconBg: 'bg-success/15',
          iconColor: 'text-success',
          badgeBg: 'bg-success/15',
          badgeText: 'text-success',
          accent: 'success',
        };
      case 'restaurant':
        return {
          ring: 'ring-brand-red-500/40',
          iconBg: 'bg-brand-red-500/15',
          iconColor: 'text-brand-red-500',
          badgeBg: 'bg-brand-red-500/15',
          badgeText: 'text-brand-red-500',
          accent: 'brand',
        };
      case 'driver':
        return {
          ring: 'ring-cyan-500/40',
          iconBg: 'bg-cyan-500/15',
          iconColor: 'text-cyan-400',
          badgeBg: 'bg-cyan-500/15',
          badgeText: 'text-cyan-400',
          accent: 'cyan',
        };
      default:
        return {
          ring: 'ring-info/40',
          iconBg: 'bg-info/15',
          iconColor: 'text-info',
          badgeBg: 'bg-info/15',
          badgeText: 'text-info',
          accent: 'info',
        };
    }
  }, [variant]);

  // Labels (3-locale aware via i18n with safeT fallback)
  const labels = {
    title:
      title ??
      (variant === 'customer'
        ? safeT(t, 'customer.deliveryAddress', 'Lieferadresse')
        : variant === 'restaurant'
        ? safeT(t, 'restaurant.address', 'Adresse')
        : variant === 'driver'
        ? safeT(t, 'driver.address', 'Adresse')
        : safeT(t, 'customer.address', 'Adresse')),
    openInMaps: safeT(t, 'customer.openInMaps', 'In Google Maps öffnen'),
    directions: safeT(t, 'driver.directions', 'Route'),
    call: safeT(t, 'restaurant.callCustomer', 'Anrufen'),
    copy: safeT(t, 'common.copy', 'Kopieren'),
    copied: safeT(t, 'common.copied', 'Kopiert!'),
    showMore: safeT(t, 'customer.showMore', 'Mehr anzeigen'),
    showLess: safeT(t, 'customer.showLess', 'Weniger anzeigen'),
    floor: safeT(t, 'customer.floor', 'Etage'),
    door: safeT(t, 'customer.door', 'Tür'),
    notes: safeT(t, 'customer.notes', 'Notizen'),
    noCoords: safeT(t, 'customer.noCoords', 'Keine Koordinaten'),
  };

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-edge',
        'bg-gradient-to-br from-ink-700/70 via-surface-elevated to-surface-elevated',
        'ring-1',
        theme.ring,
        compact ? 'p-3' : 'p-4 sm:p-5',
      )}
      aria-label={labels.title}
    >
      {/* Background radial glow */}
      <div
        className={cn(
          'pointer-events-none absolute -top-12 -end-12 w-40 h-40 rounded-full opacity-30 blur-3xl',
          variant === 'customer' && 'bg-success/40',
          variant === 'restaurant' && 'bg-brand-red-500/40',
          variant === 'driver' && 'bg-cyan-500/40',
          variant === 'default' && 'bg-info/40',
        )}
        aria-hidden
      />

      {/* Header row: icon + title + copy */}
      <div className="relative flex items-center gap-3 mb-3">
        <div
          className={cn(
            'flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl',
            theme.iconBg,
            'shadow-speed',
          )}
        >
          <MapPin className={cn('w-5 h-5', theme.iconColor)} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[10px] font-extrabold uppercase tracking-wider', theme.badgeText)}>
            {labels.title}
          </p>
          <h2 className="text-base font-extrabold text-white truncate">
            {addr.street ?? extractStreet(addr.address) ?? labels.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={copyToClipboard}
          aria-label={labels.copy}
          className={cn(
            'flex-shrink-0 inline-flex items-center gap-1 px-2.5 h-8 rounded-full',
            'bg-surface border border-edge',
            'text-[10px] font-bold uppercase tracking-wider',
            'hover:border-brand-red-500/60 hover:text-white',
            'active:scale-95 transition-all duration-150',
            copied && 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
          <span>{copied ? labels.copied : labels.copy}</span>
        </button>
      </div>

      {/* Address text — never truncated incorrectly */}
      <div className="relative">
        <div
          ref={addressRef}
          className={cn(
            'text-text leading-relaxed font-semibold',
            compact ? 'text-sm' : 'text-base sm:text-lg',
            'whitespace-pre-wrap break-words',
            !showFull && 'line-clamp-1',
          )}
          dir="ltr"
        >
          {addr.address}
        </div>

        {/* Show more / less button — only when overflowing */}
        {expandable && isOverflowing && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className={cn(
              'mt-1 inline-flex items-center gap-1 text-xs font-bold',
              theme.badgeText,
              'hover:underline transition-all',
            )}
          >
            {showFull ? (
              <>
                <ChevronUp className="w-3 h-3" />
                {labels.showLess}
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                {labels.showMore}
              </>
            )}
          </button>
        )}
      </div>

      {/* Address structured details (city / postal / country) */}
      {(addr.postal || addr.city || addr.country) && (
        <p className="text-xs text-text-secondary mt-1.5 tabular-nums" dir="ltr">
          {[addr.postal, addr.city].filter(Boolean).join(' ')}
          {addr.country ? ` · ${addr.country}` : ''}
        </p>
      )}

      {/* Floor / door chips — when relevant for delivery */}
      {(addr.floor || addr.door) && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {addr.floor && (
            <span className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-surface border border-edge text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {labels.floor} <span className="text-white">{addr.floor}</span>
            </span>
          )}
          {addr.door && (
            <span className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-surface border border-edge text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {labels.door} <span className="text-white">{addr.door}</span>
            </span>
          )}
        </div>
      )}

      {/* Driver instructions / notes */}
      {instructions && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-warning/90 font-medium leading-relaxed">
            {instructions}
          </p>
        </div>
      )}

      {/* Contact info */}
      {(name || phone) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          {name && (
            <span className="font-bold text-text">{name}</span>
          )}
          {name && phone && <span className="text-text-muted">·</span>}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="font-mono tabular-nums text-text-secondary hover:text-white transition-colors"
              dir="ltr"
            >
              {phone}
            </a>
          )}
        </div>
      )}

      {/* GPS coords (only when available) */}
      {lat != null && lng != null && (
        <p
          className="mt-2 text-[10px] text-text-muted font-mono flex items-center gap-1.5 tabular-nums"
          dir="ltr"
        >
          <Crosshair className="w-3 h-3" />
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}

      {/* Action buttons: Maps / Directions / Call */}
      {(showNavigation || showPhone) && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {showNavigation && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5',
                'h-10 px-3 rounded-xl',
                'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white',
                'shadow-glow hover:shadow-glow-strong',
                'text-xs font-extrabold uppercase tracking-wider',
                'active:scale-[0.97] hover:-translate-y-0.5',
                'transition-all duration-200 ease-silk',
              )}
            >
              <Navigation className="w-3.5 h-3.5" />
              {labels.openInMaps}
            </a>
          )}

          {showNavigation && directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center justify-center gap-1.5',
                'h-10 px-3 rounded-xl',
                'bg-live-gradient text-white',
                'shadow-glow-info hover:shadow-[0_12px_36px_-4px_rgba(6,182,212,0.7)]',
                'text-xs font-extrabold uppercase tracking-wider',
                'active:scale-[0.97] hover:-translate-y-0.5',
                'transition-all duration-200 ease-silk',
              )}
            >
              <Navigation className="w-3.5 h-3.5" />
              {labels.directions}
            </a>
          )}

          {showPhone && phone && (
            <a
              href={`tel:${phone}`}
              className={cn(
                'inline-flex items-center justify-center gap-1.5',
                'h-10 px-3 rounded-xl',
                'bg-tip-gradient text-white',
                'shadow-glow-success hover:shadow-[0_12px_36px_-4px_rgba(16,185,129,0.7)]',
                'text-xs font-extrabold uppercase tracking-wider',
                'active:scale-[0.97] hover:-translate-y-0.5',
                'transition-all duration-200 ease-silk',
              )}
            >
              <Phone className="w-3.5 h-3.5" />
              {labels.call}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Parse a freeform address string into structured parts.
 * "Sechtemer Str. 2, 53332 Bornheim, Germany" → { street, postal, city, country }
 */
function parseAddressString(input: string, extras: Partial<DeliveryAddress> = {}): DeliveryAddress {
  const result: DeliveryAddress = { address: input, ...extras };

  // Strip country
  const COUNTRY_RE = /,\s*(Germany|Deutschland|Deutschland|Saudi Arabia|السعودية|Deutschland|United Arab Emirates|UAE|إمارات)$/i;
  const countryMatch = input.match(COUNTRY_RE);
  if (countryMatch) {
    result.country = countryMatch[1];
    input = input.replace(COUNTRY_RE, '').trim().replace(/[,.]$/, '');
  }

  // Extract postal code + city (German: 5 digits at end)
  const POSTAL_DE_RE = /,\s*(\d{4,5})\s+([^,]+)$/;
  const postalMatch = input.match(POSTAL_DE_RE);
  if (postalMatch) {
    result.postal = postalMatch[1];
    result.city = postalMatch[2].trim();
    input = input.replace(POSTAL_DE_RE, '').trim();
  } else {
    // Try Arabic patterns / generic
    const parts = input.split(',').map((p) => p.trim());
    if (parts.length > 1) {
      // Last part is usually city
      const last = parts[parts.length - 1];
      // If last is short and alphabetic, it's a city
      if (last.length < 50 && /[A-Za-z\u0600-\u06FF]/.test(last)) {
        result.city = last;
        input = parts.slice(0, -1).join(', ');
      }
    }
  }

  // The remaining text is the street
  result.street = input.trim();
  return result;
}

function extractStreet(address: string): string {
  // Take the first comma-separated part
  return address.split(',')[0]?.trim() ?? address;
}
