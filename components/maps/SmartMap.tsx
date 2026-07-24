'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { GoogleMap as GoogleMapComponent } from './GoogleMap';
import { OSMMap, type MapMarker } from './OSMMap';
import { loadGoogleMaps, GOOGLE_MAPS_API_KEY } from '@/lib/maps/google-maps';

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  directions?: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  };
  selectable?: boolean;
  onSelect?: (lat: number, lng: number) => void;
  height?: string;
  showUserLocation?: boolean;
  /** When false, the map won't auto-pan on marker updates. Defaults to true. */
  autoCenter?: boolean;
}

type MapMode = 'checking' | 'google' | 'osm' | 'error';

/**
 * Smart map wrapper:
 * - Tries Google Maps first
 * - Falls back to OpenStreetMap (Leaflet, no API key required)
 * - Catches all errors and shows a professional fallback
 * - Never throws to the parent - always renders something
 */
export function SmartMap(props: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<MapMode>('checking');

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      // Quick precheck: validate key format
      if (!GOOGLE_MAPS_API_KEY || !GOOGLE_MAPS_API_KEY.startsWith('AIza')) {
        if (!cancelled) setMode('osm');
        return;
      }

      // Try to load Google Maps - if it fails, fall back to OSM
      try {
        await loadGoogleMaps();
        if (!cancelled) setMode('google');
      } catch (err) {
        console.warn('[SmartMap] Google Maps failed, using OSM:', err);
        if (!cancelled) setMode('osm');
      }
    }

    decide();

    // Failsafe timeout - if nothing resolves in 8s, use OSM
    const t = setTimeout(() => {
      if (!cancelled) setMode((prev) => (prev === 'checking' ? 'osm' : prev));
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // Loading state
  if (mode === 'checking') {
    return (
      <div
        className="flex items-center justify-center bg-surface-elevated rounded-md border border-edge-light"
        style={{ height: props.height || '400px' }}
      >
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t?.common?.loading || 'Loading map...'}</span>
        </div>
      </div>
    );
  }

  // Render OSM fallback
  if (mode === 'osm') {
    return <OSMMap {...props} />;
  }

  // Render Google Maps
  if (mode === 'google') {
    return (
      <ErrorBoundary fallback={<OSMMap {...props} />}>
        <GoogleMapComponent {...props} />
      </ErrorBoundary>
    );
  }

  // Should not reach here but fallback
  return <OSMMap {...props} />;
}

/**
 * Simple React error boundary - renders fallback if children throw.
 * Ensures map errors never break the entire page.
 */
import React from 'react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[SmartMap] Google Maps crashed, using OSM fallback:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
