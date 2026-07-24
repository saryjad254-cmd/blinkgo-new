'use client';

import { useState, useEffect, memo, useMemo } from 'react';
import { MapPin, Navigation, Phone, ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { geocodeAddress, googleMapsUrl, googleMapsDirectionsUrl } from '@/lib/maps/google-maps';

interface Props {
  /** Display address (German/English text from DB) */
  address?: string | null;
  /** Optional pre-resolved GPS */
  lat?: number | null;
  lng?: number | null;
  /** Title shown above address (e.g. "Restaurant", "Delivery address") */
  label?: string;
  /** Show phone link if provided */
  phone?: string | null;
  /** Show directions link TO this location (provide origin coords) */
  directionsFrom?: { lat: number; lng: number } | null;
  /** Color theme */
  variant?: 'restaurant' | 'customer' | 'driver';
  /** Show navigation buttons (Open in Maps, Directions) - true by default */
  showNavigation?: boolean;
  /** Show call button - true by default */
  showPhone?: boolean;
  /** Compact mode for tight UI */
  compact?: boolean;
}

/**
 * AddressWithMap
 * ──────────────
 * Renders an address with optional action buttons.
 *
 * Wrapped in `React.memo` so it does NOT re-render when the parent
 * re-renders unless one of its props actually changed — critical for
 * performance inside high-frequency-rendering trees (driver dashboard,
 * live tracking).
 *
 * By default:
 * - For restaurants: shows open-in-maps + call (customer wants to know location)
 * - For customer addresses: hides navigation (customer knows their own address)
 * - For driver addresses: shows everything (driver needs directions)
 *
 * Override with `showNavigation={false}` for any variant.
 */
export const AddressWithMap = memo(function AddressWithMap({
  address,
  lat: propLat,
  lng: propLng,
  label,
  phone,
  directionsFrom,
  variant = 'customer',
  showNavigation,
  showPhone = true,
  compact = false,
}: Props) {
  const { locale, t } = useI18n();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    propLat != null && propLng != null ? { lat: propLat, lng: propLng } : null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  // Default showNavigation based on variant
  const shouldShowNavigation = showNavigation ?? (
    variant === 'restaurant' || variant === 'driver'
  );

  // Try geocoding if no GPS provided
  useEffect(() => {
    if (coords || !address || geocodeFailed) return;
    if (propLat != null && propLng != null) return;

    let cancelled = false;
    setGeocoding(true);
    geocodeAddress(address).then((result) => {
      if (cancelled) return;
      if (result) {
        setCoords({ lat: result.lat, lng: result.lng });
      } else {
        setGeocodeFailed(true);
      }
      setGeocoding(false);
    });

    return () => {
      cancelled = true;
    };
  }, [address, propLat, propLng, coords, geocodeFailed]);

  // Memoize colors and labels (no need to re-create on every render)
  const colors = useMemo(() => {
    return {
      accent: {
        restaurant: 'text-brand-red-500',
        customer: 'text-success',
        driver: 'text-green-400',
      }[variant],
      bg: {
        restaurant: 'bg-brand-red-500/10',
        customer: 'bg-success/10',
        driver: 'bg-green-500/10',
      }[variant],
    };
  }, [variant]);

  // 3-locale labels (a single source of truth, no hardcoded DE in AR/EN pages)
  const labels = useMemo(() => {
    return {
      openInMaps:
        locale === 'ar'
          ? 'افتح في خريطة جوجل'
          : locale === 'en'
          ? 'Open in Google Maps'
          : 'In Google Maps öffnen',
      call:
        locale === 'ar' ? 'اتصال' : locale === 'en' ? 'Call' : 'Anrufen',
      directions:
        locale === 'ar' ? 'الاتجاهات' : locale === 'en' ? 'Directions' : 'Route',
      noCoords:
        locale === 'ar' ? 'بدون إحداثيات' : locale === 'en' ? 'No coordinates' : 'Keine Koordinaten',
      geocoding:
        locale === 'ar'
          ? 'جاري البحث عن الموقع...'
          : locale === 'en'
          ? 'Looking up location...'
          : 'Suche Standort...',
    };
  }, [locale]);

  if (!address && !coords) return null;

  // Pick API key from a stable helper instead of duplicating string logic.
  const mapsUrl = coords
    ? googleMapsUrl(coords.lat, coords.lng, address || undefined)
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;

  const directionsUrl = coords && directionsFrom
    ? googleMapsDirectionsUrl(directionsFrom.lat, directionsFrom.lng, coords.lat, coords.lng, 'driving')
    : null;

  return (
    <div className={`${compact ? 'py-2' : 'p-4 rounded-md bg-surface-elevated border border-edge-light'}`}>
      {label && (
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-7 h-7 rounded-md ${colors.bg} flex items-center justify-center`}>
            <MapPin className={`w-3.5 h-3.5 ${colors.accent}`} />
          </div>
          <span className={`text-xs font-bold uppercase tracking-wide ${colors.accent}`}>
            {label}
          </span>
        </div>
      )}
      <div className="flex items-start gap-2">
        {!compact && (
          <MapPin className={`w-4 h-4 mt-0.5 ${colors.accent} flex-shrink-0`} />
        )}
        <p className={`flex-1 text-sm text-text-secondary leading-relaxed ${compact ? '' : 'min-h-[20px]'}`}>
          {address || labels.noCoords}
        </p>
      </div>

      {coords && (
        <p className="text-xs text-text-muted mt-1 font-mono" dir="ltr">
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}

      {geocoding && (
        <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {labels.geocoding}
        </p>
      )}

      {shouldShowNavigation && (
        <div className="flex flex-wrap gap-2 mt-3">
          {/* Open in Maps */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-bold transition-all ${
              coords
                ? 'bg-brand-red-500 text-white hover:bg-brand-red-500/90 shadow-speed-sm'
                : 'bg-surface border border-edge-light text-text-secondary hover:text-white hover:border-brand-red-500/40'
            }`}
          >
            <ExternalLink className="w-3 h-3" />
            {labels.openInMaps}
          </a>

          {/* Directions button (only if both origin and dest coords available) */}
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-bold bg-ocean-gradient text-white hover:opacity-90 transition-all shadow-speed-sm"
            >
              <Navigation className="w-3 h-3" />
              {labels.directions}
            </a>
          )}
        </div>
      )}

      {showPhone && phone && (
        <div className={`flex flex-wrap gap-2 ${shouldShowNavigation ? 'mt-2' : 'mt-3'}`}>
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-bold bg-success/10 border border-success/30 text-success hover:bg-success/20 transition-all"
          >
            <Phone className="w-3 h-3" />
            <span dir="ltr">{phone}</span>
          </a>
        </div>
      )}
    </div>
  );
});
