'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import { loadLeaflet } from '@/lib/maps/load-leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type?: 'restaurant' | 'customer' | 'driver' | 'market' | 'pharmacy';
  title?: string;
  info?: string;
  rotation?: number;
  speed?: number | null;
  accuracy?: number | null;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  is_on_delivery?: boolean;
}

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  directions?: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  };
  autoCenter?: boolean;
  height?: string;
}

/** Stable Leaflet map whose layers update without recreating the map instance. */
export function OSMMap({ center, zoom = 14, markers = [], directions, autoCenter = true, height = '400px' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeLayerRef = useRef<Leaflet.Polyline | null>(null);
  const initialViewRef = useRef({ center: center ?? { lat: 50.7374, lng: 7.0982 }, zoom });
  const [readyRevision, setReadyRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    void loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      const initial = initialViewRef.current;
      const map = L.map(containerRef.current, {
        center: [initial.center.lat, initial.center.lng],
        zoom: initial.zoom,
        zoomControl: true,
        attributionControl: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        inertia: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
      }).addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      setLoading(false);
      setReadyRevision((value) => value + 1);
      window.setTimeout(() => { if (!cancelled) map.invalidateSize({ animate: false }); }, 0);
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : 'Failed to load map');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      const map = mapRef.current;
      mapRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
      leafletRef.current = null;
      if (map) {
        try { map.stop(); map.off(); map.remove(); } catch { /* already removed */ }
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!L || !map || !markerLayer || readyRevision === 0) return;

    markerLayer.clearLayers();
    const points: Leaflet.LatLngExpression[] = [];
    for (const markerData of markers) {
      if (!Number.isFinite(markerData.lat) || !Number.isFinite(markerData.lng)) continue;
      const position: Leaflet.LatLngExpression = [markerData.lat, markerData.lng];
      points.push(position);
      const marker = L.marker(position, { icon: createMarkerIcon(L, markerData), keyboard: true });
      if (markerData.title || markerData.info) {
        marker.bindPopup(`<b>${escapeHtml(markerData.title || markerData.type || 'Location')}</b>${markerData.info ? `<br>${escapeHtml(markerData.info)}` : ''}`);
      }
      if (markerData.onClick) marker.on('click', markerData.onClick);
      marker.addTo(markerLayer);
    }

    if (routeLayerRef.current) {
      routeLayerRef.current.removeFrom(map);
      routeLayerRef.current = null;
    }
    if (directions) {
      const routePoints: Leaflet.LatLngExpression[] = [
        [directions.origin.lat, directions.origin.lng],
        [directions.destination.lat, directions.destination.lng],
      ];
      routeLayerRef.current = L.polyline(routePoints, {
        color: '#e10600', weight: 5, opacity: 0.9, dashArray: '10 8', lineCap: 'round',
      }).addTo(map);
      points.push(...routePoints);
    }

    map.stop();
    if (autoCenter && points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], animate: false, maxZoom: 16 });
    } else if (autoCenter && center) {
      map.setView([center.lat, center.lng], zoom, { animate: false });
    }
  }, [autoCenter, center, directions, markers, readyRevision, zoom]);

  if (error) {
    return <div className="flex flex-col items-center justify-center rounded-md border border-edge-light bg-surface-elevated p-6 text-center" style={{ height }}><AlertTriangle className="mb-2 size-8 text-warning" /><p className="mb-1 text-sm font-semibold text-white">Map error</p><p className="text-xs text-text-muted">{error}</p></div>;
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-edge-light" style={{ height }}>
      {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80 backdrop-blur-sm"><div className="flex items-center gap-2 text-white"><Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading map...</span></div></div>}
      <div ref={containerRef} className="size-full" />
    </div>
  );
}

function createMarkerIcon(L: typeof Leaflet, marker: MapMarker): Leaflet.DivIcon {
  const type = marker.type || 'restaurant';
  const busy = type === 'driver' && marker.is_on_delivery;
  const sizePx = marker.size === 'sm' ? 32 : marker.size === 'lg' ? 48 : 40;
  const iconSize = marker.size === 'sm' ? 14 : marker.size === 'lg' ? 22 : 18;
  const color: Record<string, string> = { restaurant: '#E10600', market: '#10b981', pharmacy: '#3b82f6', customer: '#06b6d4', driver: busy ? '#E10600' : '#FF2A2A' };
  const paths: Record<string, string> = {
    restaurant: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    customer: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    market: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    pharmacy: '<path d="M12 11v6M9 14h6"/>',
    driver: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  };
  const rotation = marker.rotation == null ? '' : `transform:rotate(${marker.rotation}deg);`;
  const pulse = busy ? '<span style="position:absolute;inset:-6px;border-radius:50%;background:#E10600;opacity:.3;animation:blinkgo-pulse 1.4s ease-out infinite"></span>' : '';
  const title = marker.title ? `<div style="position:absolute;top:${sizePx + 6}px;left:50%;transform:translateX(-50%);background:rgba(10,10,14,.92);color:white;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap">${escapeHtml(marker.title)}</div>` : '';
  return L.divIcon({
    className: 'custom-marker',
    iconSize: [sizePx, sizePx],
    iconAnchor: [sizePx / 2, sizePx / 2],
    html: `<div style="position:relative;display:inline-block">${pulse}<div style="background:${color[type] || color.restaurant};border:3px solid white;border-radius:50%;width:${sizePx}px;height:${sizePx}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.35);color:white;${rotation}position:relative;z-index:1"><svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths[type] || paths.restaurant}</svg></div>${title}</div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}
