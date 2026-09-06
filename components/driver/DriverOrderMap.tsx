'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { loadLeaflet } from '@/lib/maps/load-leaflet';
import {
  GOOGLE_MAPS_MAP_ID,
  createGoogleMarker,
  createGoogleMarkerVisual,
  loadGoogleMaps,
  removeGoogleMarker,
  type GoogleMarkerInstance,
} from '@/lib/maps/google-maps';

interface Props {
  driverLat: number | null;
  driverLng: number | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  customerLat: number | null;
  customerLng: number | null;
  restaurantName?: string;
  customerName?: string;
  driverIsPrimary?: boolean;
}

/**
 * DriverOrderMap
 * ───────────────
 * Shows a 2-3 point map with driver, restaurant, customer.
 * Uses Google Maps when available, falls back to OSM.
 * 
 * Driver pin: blue arrow
 * Restaurant pin: orange with store icon
 * Customer pin: green with home icon
 */
export function DriverOrderMap({
  driverLat, driverLng,
  restaurantLat, restaurantLng,
  customerLat, customerLng,
  restaurantName, customerName,
  driverIsPrimary = false,
}: Props) {
  const { locale } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  const cleanupMapRef = useRef<() => void>(() => undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Determine bounds
  const points = useMemo(() => {
    const next: Array<{ lat: number; lng: number; type: 'driver' | 'restaurant' | 'customer' }> = [];
    if (driverLat != null && driverLng != null) next.push({ lat: driverLat, lng: driverLng, type: 'driver' });
    if (restaurantLat != null && restaurantLng != null) next.push({ lat: restaurantLat, lng: restaurantLng, type: 'restaurant' });
    if (customerLat != null && customerLng != null) next.push({ lat: customerLat, lng: customerLng, type: 'customer' });
    return next;
  }, [driverLat, driverLng, restaurantLat, restaurantLng, customerLat, customerLng]);

  useEffect(() => {
    if (points.length === 0 || !mapRef.current) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    cleanupMapRef.current();
    setLoading(true);
    setError(null);

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const initMap = async () => {
      try {
        // Try Google Maps
        if (apiKey && apiKey.startsWith('AIza')) {
          const googleApi = await loadGoogleMaps();
          const maps = googleApi.maps;
          if (cancelled || !mapRef.current) return;
          const container = mapRef.current;
          const map = new maps.Map(container, {
            zoom: 13,
            center: points[0],
            disableDefaultUI: true,
            zoomControl: true,
            styles: GOOGLE_MAPS_MAP_ID ? undefined : mapStyles,
            mapId: GOOGLE_MAPS_MAP_ID || undefined,
          });

          // Add markers
          const googleMarkers: GoogleMarkerInstance[] = [];
          points.forEach((p) => {
            const title = p.type === 'restaurant' ? (restaurantName || p.type) : p.type === 'customer' ? (customerName || p.type) : p.type;
            googleMarkers.push(createGoogleMarker({
              position: { lat: p.lat, lng: p.lng },
              map,
              legacyIcon: getMarkerIcon(p.type),
              content: getAdvancedMarkerVisual(p.type),
              title,
              zIndex: p.type === 'driver' ? 1000 : 500,
            }));
          });

          // Draw route line from driver to primary destination
          if (driverLat != null && driverLng != null) {
            const dest = driverIsPrimary
              ? (restaurantLat != null && restaurantLng != null ? { lat: restaurantLat, lng: restaurantLng } : (customerLat != null && customerLng != null ? { lat: customerLat, lng: customerLng } : null))
              : (customerLat != null && customerLng != null ? { lat: customerLat, lng: customerLng } : null);
            
            if (dest) {
              new maps.Polyline({
                path: [{ lat: driverLat, lng: driverLng }, dest],
                geodesic: true,
                strokeColor: driverIsPrimary ? '#E10600' : '#10b981',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                map,
              });
            }
          }

          // Fit bounds
          if (points.length > 1) {
            const bounds = new maps.LatLngBounds();
            points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
            map.fitBounds(bounds, 60);
          }

          cleanupMapRef.current = () => {
            googleMarkers.forEach(removeGoogleMarker);
            maps.event.clearInstanceListeners(map);
            container.replaceChildren();
          };
          setMapReady(true);
          setLoading(false);
          return;
        }

        throw new Error('No Google Maps API key');
      } catch {
        // Fallback to OSM
        if (cancelled || !mapRef.current) return;
        await initOSMMap();
      }
    };

    const initOSMMap = async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRef.current) return;

        const centerLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
        const centerLng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
        const map = L.map(mapRef.current, {
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        }).setView([centerLat, centerLng], 13, { animate: false });
        cleanupMapRef.current = () => {
          map.stop();
          map.off();
          map.remove();
        };

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap, © CARTO',
          maxZoom: 19,
        }).addTo(map);

        const icons = {
          driver: L.divIcon({
            className: '',
            html: '<div style="background:#3b82f6;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          }),
          restaurant: L.divIcon({
            className: '',
            html: '<div style="background:#E10600;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏪</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          }),
          customer: L.divIcon({
            className: '',
            html: '<div style="background:#10b981;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏠</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          }),
        };

        points.forEach((p) => {
          const title = p.type === 'restaurant' ? (restaurantName || p.type) : p.type === 'customer' ? (customerName || p.type) : p.type;
          L.marker([p.lat, p.lng], { icon: icons[p.type], title }).addTo(map);
        });

        // Draw route
        if (driverLat != null && driverLng != null) {
          const dest: [number, number] | null = driverIsPrimary
            ? (restaurantLat != null && restaurantLng != null ? [restaurantLat, restaurantLng] : null)
            : (customerLat != null && customerLng != null ? [customerLat, customerLng] : null);
          if (dest) {
            L.polyline([[driverLat, driverLng], dest], {
              color: driverIsPrimary ? '#E10600' : '#10b981',
              weight: 4,
              opacity: 0.8,
            }).addTo(map);
          }
        }

        if (points.length > 1) {
          const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
          map.fitBounds(bounds, { padding: [60, 60], animate: false });
        }

        setMapReady(true);
        setLoading(false);
      } catch (mapError) {
        if (cancelled) return;
        console.error('Driver map initialization failed', mapError);
        setError(locale === 'ar' ? 'تعذر تحميل الخريطة' : 'Karte konnte nicht geladen werden');
        setLoading(false);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      cleanupMapRef.current();
      cleanupMapRef.current = () => undefined;
    };
  }, [driverLat, driverLng, restaurantLat, restaurantLng, customerLat, customerLng, restaurantName, customerName, driverIsPrimary, locale, points]);

  if (points.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-gray-300 p-8 text-center">
        <MapPin className="w-8 h-8 mx-auto mb-2 text-text-muted" />
        <p className="text-sm text-text-muted font-bold">
          {locale === 'ar' ? 'لا توجد إحداثيات للخريطة' : 'Keine Koordinaten für die Karte'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm"
      style={{ height: '280px' }}
      data-testid="driver-order-map"
      role="region"
      aria-label={locale === 'ar' ? 'خريطة التوصيل المباشرة' : locale === 'en' ? 'Live delivery map' : 'Live-Lieferkarte'}
    >
      <div ref={mapRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      )}
      {error && (
        <div className="absolute top-3 left-3 right-3 bg-warning/15 border border-warning/30 rounded-lg p-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
          <span className="text-xs text-brand-yellow-900 font-bold">{error}</span>
        </div>
      )}
      {mapReady && (
        <div
          className="absolute top-3 left-3 flex flex-col gap-1.5"
          data-testid="driver-map-legend"
          role="list"
          aria-label={locale === 'ar' ? 'مفتاح الخريطة' : 'Kartenlegende'}
        >
          {restaurantLat != null && (
            <div role="listitem" className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-accent-200">
              <div className="w-2 h-2 rounded-full bg-brand-500" />
              <span className="text-[10px] font-extrabold text-slate-900 uppercase tracking-wide">
                {locale === 'ar' ? 'مطعم' : 'Restaurant'}
              </span>
            </div>
          )}
          {customerLat != null && (
            <div role="listitem" className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-success/30">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-extrabold text-slate-900 uppercase tracking-wide">
                {locale === 'ar' ? 'عميل' : 'Kunde'}
              </span>
            </div>
          )}
          {driverLat != null && (
            <div role="listitem" className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-info/30">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] font-extrabold text-slate-900 uppercase tracking-wide">
                {locale === 'ar' ? 'أنت' : 'Sie'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getMarkerIcon(type: 'driver' | 'restaurant' | 'customer'): google.maps.Symbol | null {
  switch (type) {
    case 'driver':
      return {
        path: 'M 0,-10 L -8,8 L 0,4 L 8,8 Z',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
        scale: 1.5,
        rotation: 0,
      };
    case 'restaurant':
      return {
        path: 'M 0,-2 L -10,-2 L -10,8 L -3,8 L -3,16 L 3,16 L 3,8 L 10,8 L 10,-2 Z',
        fillColor: '#E10600',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
        scale: 1.3,
      };
    case 'customer':
      return {
        path: 'M 0,-2 L -10,-2 L -10,8 L -3,8 L -3,16 L 3,16 L 3,8 L 10,8 L 10,-2 Z',
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
        scale: 1.3,
      };
    default:
      return null;
  }
}

function getAdvancedMarkerVisual(type: 'driver' | 'restaurant' | 'customer'): HTMLDivElement {
  const visual = createGoogleMarkerVisual(
    type === 'driver' ? '➤' : type === 'restaurant' ? 'R' : '⌂',
    {
      background: type === 'driver' ? '#3b82f6' : type === 'restaurant' ? '#E10600' : '#10b981',
      size: type === 'driver' ? 34 : 38,
      radius: type === 'driver' ? '50% 50% 50% 0' : '10px',
    },
  );
  if (type === 'driver') visual.style.transform = 'rotate(-45deg)';
  return visual;
}

const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a8a8b3' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d4d4dc' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a8a8b3' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e3a2e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a3e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a4e' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3f4f6' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d4d4dc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
];
