'use client';

/**
 * SearchMap — Search-specific map with marker clustering + 2-way sync
 *
 * Features:
 *  - Live restaurant markers from search results
 *  - Marker clustering for many markers in same area
 *  - Sync map viewport with search results (auto-fit bounds)
 *  - Selecting a marker highlights the corresponding restaurant card
 *  - Selecting a restaurant card pans/zooms the map
 *  - Falls back to OpenStreetMap (no API key required) via SmartMap
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, MarkerClusterGroup } from 'leaflet';
import type * as Leaflet from 'leaflet';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { loadLeafletWithCluster } from '@/lib/maps/load-leaflet';

export interface SearchMapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  rating?: number;
  delivery_time_min?: number;
  delivery_fee?: number;
}

interface Props {
  /** Markers to display */
  markers: SearchMapMarker[];
  /** Currently highlighted marker (2-way sync) */
  highlightedId?: string | null;
  /** Callback when a marker is clicked */
  onMarkerClick?: (id: string) => void;
  /** User's current location (for centering) */
  userLocation?: { lat: number; lng: number } | null;
  /** Map height CSS */
  height?: string;
}

export interface SearchMapHandle {
  /** Pan/zoom to a specific marker */
  focusMarker: (id: string) => void;
  /** Fit all markers in view */
  fitBounds: () => void;
}

export const SearchMap = forwardRef<SearchMapHandle, Props>(function SearchMap(
  { markers, highlightedId, onMarkerClick, userLocation, height = '500px' },
  ref
) {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const clusterGroupRef = useRef<MarkerClusterGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const center = userLocation || (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 50.7374, lng: 7.0982 });

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    focusMarker: (id: string) => {
      const marker = markersRef.current.get(id);
      const map = mapRef.current;
      if (marker && map) {
        const latlng = marker.getLatLng();
        map.setView(latlng, 15, { animate: true, duration: 0.5 });
        marker.openPopup();
      }
    },
    fitBounds: () => {
      const map = mapRef.current;
      const group = clusterGroupRef.current;
      if (map && group) {
        try {
          map.fitBounds(group.getBounds().pad(0.15));
        } catch {}
      }
    },
  }), []);

  // Initialize map
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const L = await loadLeafletWithCluster();
        if (cancelled || !containerRef.current) return;
        leafletRef.current = L;

        const map = L.map(containerRef.current, {
          center: [center.lat, center.lng],
          zoom: markers.length > 1 ? 12 : 14,
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: true,
        });

        // Dark tiles (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors © CARTO',
          maxZoom: 19,
        }).addTo(map);

        // Cluster group
        const cluster = L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          chunkedLoading: true,
          maxClusterRadius: 50,
        });

        mapRef.current = map;
        clusterGroupRef.current = cluster;
        map.addLayer(cluster);

        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error('[SearchMap] init failed:', e);
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when prop changes
  useEffect(() => {
    if (loading || error || !mapRef.current || !clusterGroupRef.current) return;
    const L = leafletRef.current;
    if (!L) return;
    const map = mapRef.current;
    const cluster = clusterGroupRef.current;

    // Clear existing markers
    cluster.clearLayers();
    markersRef.current.clear();

    // Add new markers
    const newMarkers: LeafletMarker[] = [];
    for (const m of markers) {
      if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
      const icon = L.divIcon({
        className: 'blinkgo-search-marker',
        html: '<div style="position:relative;width:42px;height:42px;display:grid;place-items:center;border-radius:14px 14px 14px 4px;transform:rotate(-45deg);background:linear-gradient(135deg,#FFC107 0%,#ff7600 45%,#E10600 100%);border:2px solid rgba(255,255,255,.92);box-shadow:0 10px 28px rgba(225,6,0,.38),0 0 0 5px rgba(225,6,0,.14)"><span style="transform:rotate(45deg);font:900 italic 18px/1 Inter,system-ui,sans-serif;color:#050505">B</span></div>',
        iconSize: [42, 42],
        iconAnchor: [8, 38],
        popupAnchor: [13, -35],
      });
      const marker = L.marker([m.lat, m.lng], {
        title: m.name,
        icon,
        keyboard: true,
      });
      const popupHtml = `
        <div style="min-width:160px;font-family:Inter,system-ui,sans-serif;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(m.name)}</div>
          ${m.rating != null ? `<div style="font-size:12px;color:#FFC107;margin-bottom:2px;">★ ${m.rating.toFixed(1)}</div>` : ''}
          ${m.delivery_time_min != null ? `<div style="font-size:11px;color:#888;">⏱ ${m.delivery_time_min} min</div>` : ''}
          ${m.delivery_fee != null ? `<div style="font-size:11px;color:#888;">🚚 ${m.delivery_fee === 0 ? 'Gratis' : '€' + m.delivery_fee.toFixed(2)}</div>` : ''}
          <a href="/restaurants/${encodeURIComponent(m.id)}" style="display:inline-block;margin-top:6px;padding:4px 8px;background:#E10600;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">${locale === 'ar' ? 'عرض القائمة ←' : locale === 'en' ? 'View menu →' : 'Menü ansehen →'}</a>
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        if (onMarkerClick) onMarkerClick(m.id);
      });
      newMarkers.push(marker);
      markersRef.current.set(m.id, marker);
    }
    cluster.addLayers(newMarkers);

    // Auto-fit if many markers
    if (newMarkers.length > 1) {
      try {
        map.fitBounds(cluster.getBounds().pad(0.15));
      } catch {}
    } else if (newMarkers.length === 1) {
      map.setView(newMarkers[0].getLatLng(), 14, { animate: true });
    }
  }, [markers, loading, error, onMarkerClick, locale]);

  // Highlight on prop change
  useEffect(() => {
    if (!highlightedId) return;
    const marker = markersRef.current.get(highlightedId);
    const map = mapRef.current;
    if (marker && map) {
      // Make marker stand out
      const element = marker.getElement?.();
      if (element) {
        element.style.zIndex = '1000';
        element.style.filter = 'drop-shadow(0 0 8px #E10600) drop-shadow(0 0 4px #E10600)';
      }
      try {
        const latlng = marker.getLatLng();
        map.panTo(latlng, { animate: true, duration: 0.5 });
        marker.openPopup();
      } catch {}
    }
  }, [highlightedId]);

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  }

  if (error) {
    return (
      <div
        style={{ height }}
        className="card-glass flex items-center justify-center p-8 text-center"
        role="status"
      >
        <div>
          <div className="text-text-muted text-sm">{locale === 'ar' ? 'تعذر تحميل الخريطة' : locale === 'en' ? 'Map could not be loaded' : 'Karte konnte nicht geladen werden'}</div>
          <div className="text-text-muted text-xs mt-1">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }} data-testid="search-map">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-elevated/80 backdrop-blur-sm rounded-2xl" data-testid="search-map-loading">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-text-muted">{locale === 'ar' ? 'جارٍ تحميل الخريطة…' : locale === 'en' ? 'Loading map…' : 'Karte wird geladen…'}</span>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-2xl overflow-hidden" data-testid="search-map-canvas" />
      <div className="absolute top-2 end-2 z-20 px-2 py-1 rounded-md bg-bg/80 backdrop-blur-sm text-[10px] text-text-muted border border-edge">
        🗺️ {markers.length} {locale === 'ar' ? (markers.length === 1 ? 'مطعم' : 'مطاعم') : markers.length === 1 ? 'Restaurant' : 'Restaurants'}
      </div>
    </div>
  );
});
