'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MapPinOff from 'lucide-react/dist/esm/icons/map-pin-off';
import { loadLeaflet } from '@/lib/maps/load-leaflet';
import { useI18n } from '@/lib/i18n/I18nProvider';

export interface DriverMapPoint {
  lat: number | null;
  lng: number | null;
  label: string;
}

interface DriverLiveMapProps {
  driver: DriverMapPoint;
  pickup?: DriverMapPoint | null;
  dropoff?: DriverMapPoint | null;
  hotspots?: DriverMapPoint[];
  focus: 'driver' | 'offer' | 'pickup' | 'dropoff';
}

const DEFAULT_CENTER: [number, number] = [50.8207, 6.9786];

function validPoint(point?: DriverMapPoint | null): point is DriverMapPoint & { lat: number; lng: number } {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && !(point.lat === 0 && point.lng === 0));
}

function markerIcon(L: typeof Leaflet, type: 'driver' | 'pickup' | 'dropoff') {
  const content = type === 'driver'
    ? '<span style="display:block;width:18px;height:26px;background:#e10600;clip-path:polygon(50% 0,100% 100%,50% 78%,0 100%);filter:drop-shadow(0 3px 4px rgba(0,0,0,.5));transform:rotate(12deg)"></span>'
    : type === 'pickup'
      ? '<span style="display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:#ffc107;color:#0d0d0d;border:3px solid #fff;font:900 17px system-ui;box-shadow:0 8px 22px rgba(0,0,0,.45)">P</span>'
      : '<span style="display:grid;place-items:center;width:38px;height:38px;border-radius:50% 50% 50% 12px;background:#e10600;color:#fff;border:3px solid #fff;font:900 17px system-ui;box-shadow:0 8px 22px rgba(0,0,0,.45)">D</span>';
  const size = type === 'driver' ? 30 : 42;
  return L.divIcon({ className: 'blinkgo-driver-map-marker', html: content, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export function DriverLiveMap({ driver, pickup, dropoff, hotspots = [], focus }: DriverLiveMapProps) {
  const { locale } = useI18n();
  const copy = locale === 'ar'
    ? { label: 'خريطة التوصيل المباشرة', loading: 'جارٍ تحميل خريطة BlinkGo', failed: 'الخريطة غير متاحة', fallback: 'يمكنك متابعة استخدام أزرار التوصيل.' }
    : locale === 'en'
      ? { label: 'Live delivery map', loading: 'Loading BlinkGo map', failed: 'Map unavailable', fallback: 'The delivery controls remain available.' }
      : { label: 'Live-Lieferkarte', loading: 'BlinkGo-Karte wird geladen', failed: 'Karte nicht verfügbar', fallback: 'Die Lieferaktionen bleiben verfügbar.' };
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const lastFitRef = useRef('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const points = useMemo(() => ({
    driver: validPoint(driver) ? driver : null,
    pickup: validPoint(pickup) ? pickup : null,
    dropoff: validPoint(dropoff) ? dropoff : null,
  }), [driver, pickup, dropoff]);
  const validHotspots = useMemo(() => hotspots.filter(validPoint), [hotspots]);

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      map = L.map(containerRef.current, {
        center: points.driver ? [points.driver.lat, points.driver.lng] : DEFAULT_CENTER,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      layerRef.current = null;
      mapRef.current = null;
      leafletRef.current = null;
      if (map) {
        map.stop();
        map.off();
        map.remove();
      }
    };
  // The live layers are updated independently below; the map itself is created once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    validHotspots.forEach((hotspot) => {
      L.circle([hotspot.lat, hotspot.lng], {
        radius: 850,
        color: '#ffc107',
        weight: 1,
        opacity: 0.5,
        fillColor: '#e10600',
        fillOpacity: 0.11,
        interactive: false,
      }).addTo(layer);
    });
    if (points.driver) L.marker([points.driver.lat, points.driver.lng], { icon: markerIcon(L, 'driver'), title: points.driver.label, zIndexOffset: 1000 }).addTo(layer);
    if (points.pickup) L.marker([points.pickup.lat, points.pickup.lng], { icon: markerIcon(L, 'pickup'), title: points.pickup.label, zIndexOffset: 600 }).addTo(layer);
    if (points.dropoff) L.marker([points.dropoff.lat, points.dropoff.lng], { icon: markerIcon(L, 'dropoff'), title: points.dropoff.label, zIndexOffset: 500 }).addTo(layer);

    const route: Array<[number, number]> = [];
    if (points.driver) route.push([points.driver.lat, points.driver.lng]);
    if (focus === 'dropoff') {
      if (points.dropoff) route.push([points.dropoff.lat, points.dropoff.lng]);
    } else {
      if (points.pickup) route.push([points.pickup.lat, points.pickup.lng]);
      if (focus === 'offer' && points.dropoff) route.push([points.dropoff.lat, points.dropoff.lng]);
    }
    if (route.length > 1) {
      L.polyline(route, { color: '#0d0d0d', weight: 10, opacity: 0.72, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
      L.polyline(route, { color: '#e10600', weight: 5, opacity: 1, dashArray: focus === 'offer' ? '3 11' : undefined, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
    }

    const fitKey = `${focus}:${points.pickup?.lat ?? ''}:${points.pickup?.lng ?? ''}:${points.dropoff?.lat ?? ''}:${points.dropoff?.lng ?? ''}`;
    if (fitKey !== lastFitRef.current) {
      lastFitRef.current = fitKey;
      const visible = [points.driver, points.pickup, focus === 'offer' || focus === 'dropoff' ? points.dropoff : null].filter(validPoint);
      if (visible.length > 1) {
        map.fitBounds(L.latLngBounds(visible.map((point) => [point.lat, point.lng])), { paddingTopLeft: [48, 120], paddingBottomRight: [48, 330], maxZoom: 15 });
      } else if (visible[0]) {
        map.setView([visible[0].lat, visible[0].lng], 15);
      }
    }
  }, [focus, points, ready, validHotspots]);

  return (
    <div className="absolute inset-0 bg-[#09090b]" data-testid="driver-live-map">
      <div ref={containerRef} className="h-full w-full" role="region" aria-label={copy.label} />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center bg-[#09090b] text-white">
          <div role="status" className="flex flex-col items-center gap-3"><Loader2 className="size-8 animate-spin text-[#e10600]" /><span className="text-sm font-bold text-white/65">{copy.loading}</span></div>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-[#09090b] p-6 text-center text-white">
          <div role="alert"><MapPinOff className="mx-auto size-9 text-[#e10600]" /><p className="mt-3 font-black">{copy.failed}</p><p className="mt-1 text-sm text-white/55">{copy.fallback}</p></div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_20%,rgba(0,0,0,.12)_100%)]" style={{ zIndex: 800 }} />
    </div>
  );
}
