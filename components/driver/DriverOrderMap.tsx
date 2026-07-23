'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Determine bounds
  const points: Array<{ lat: number; lng: number; type: 'driver' | 'restaurant' | 'customer' }> = [];
  if (driverLat != null && driverLng != null) points.push({ lat: driverLat, lng: driverLng, type: 'driver' });
  if (restaurantLat != null && restaurantLng != null) points.push({ lat: restaurantLat, lng: restaurantLng, type: 'restaurant' });
  if (customerLat != null && customerLng != null) points.push({ lat: customerLat, lng: customerLng, type: 'customer' });

  useEffect(() => {
    if (points.length === 0 || !mapRef.current) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const initMap = async () => {
      try {
        // Try Google Maps
        if (apiKey && apiKey.startsWith('AIza')) {
          const google = await loadGoogleMaps(apiKey);
          if (cancelled || !mapRef.current) return;
          const map = new google.maps.Map(mapRef.current, {
            zoom: 13,
            center: points[0],
            disableDefaultUI: true,
            zoomControl: true,
            styles: mapStyles,
          });

          // Add markers
          points.forEach((p) => {
            const marker = new google.maps.Marker({
              position: { lat: p.lat, lng: p.lng },
              map,
              icon: getMarkerIcon(p.type),
              title: p.type,
              zIndex: p.type === 'driver' ? 1000 : 500,
            });
          });

          // Draw route line from driver to primary destination
          if (driverLat && driverLng) {
            const dest = driverIsPrimary
              ? (restaurantLat && restaurantLng ? { lat: restaurantLat, lng: restaurantLng } : (customerLat && customerLng ? { lat: customerLat, lng: customerLng } : null))
              : (customerLat && customerLng ? { lat: customerLat, lng: customerLng } : null);
            
            if (dest) {
              new google.maps.Polyline({
                path: [{ lat: driverLat, lng: driverLng }, dest],
                geodesic: true,
                strokeColor: driverIsPrimary ? '#DC2626' : '#10b981',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                map,
              });
            }
          }

          // Fit bounds
          if (points.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
            map.fitBounds(bounds, 60);
          }

          setMapReady(true);
          setLoading(false);
          return;
        }

        throw new Error('No Google Maps API key');
      } catch (err) {
        // Fallback to OSM
        if (cancelled || !mapRef.current) return;
        initOSMMap();
      }
    };

    const initOSMMap = () => {
      const mapId = `osm-map-${Math.random().toString(36).slice(2)}`;
      mapRef.current!.innerHTML = `<div id="${mapId}" style="width:100%;height:100%;"></div>`;
      const el = document.getElementById(mapId);
      if (!el) return;

      // Calculate center
      const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

      // Use Leaflet via CDN
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        if (cancelled) return;
        // @ts-ignore
        const L = window.L;
        if (!L) return;
        const map = L.map(mapId).setView([centerLat, centerLng], 13);
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
            html: '<div style="background:#DC2626;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏪</div>',
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
          L.marker([p.lat, p.lng], { icon: icons[p.type] }).addTo(map);
        });

        // Draw route
        if (driverLat && driverLng) {
          const dest = driverIsPrimary
            ? (restaurantLat && restaurantLng ? [restaurantLat, restaurantLng] : null)
            : (customerLat && customerLng ? [customerLat, customerLng] : null);
          if (dest) {
            L.polyline([[driverLat, driverLng], dest], {
              color: driverIsPrimary ? '#DC2626' : '#10b981',
              weight: 4,
              opacity: 0.8,
            }).addTo(map);
          }
        }

        if (points.length > 1) {
          const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
          map.fitBounds(bounds, { padding: [60, 60] });
        }

        setMapReady(true);
        setLoading(false);
      };
      document.head.appendChild(script);
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, [driverLat, driverLng, restaurantLat, restaurantLng, customerLat, customerLng, driverIsPrimary]);

  if (points.length === 0) {
    return (
      <div className="bg-white rounded-3xl border-2 border-dashed border-gray-300 p-8 text-center">
        <MapPin className="w-8 h-8 mx-auto mb-2 text-text-muted" />
        <p className="text-sm text-text-muted font-bold">
          {locale === 'ar' ? 'لا توجد إحداثيات للخريطة' : locale === 'de' ? 'Keine Koordinaten für die Karte' : 'No coordinates for the map'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm" style={{ height: '280px' }}>
      <div ref={mapRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      )}
      {error && (
        <div className="absolute top-3 start-3 end-3 bg-warning/15 border border-warning/30 rounded-lg p-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
          <span className="text-xs text-brand-yellow-900 font-bold">{error}</span>
        </div>
      )}
      {mapReady && (
        <div className="absolute top-3 start-3 flex flex-col gap-1.5">
          {restaurantLat && (
            <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-accent-200">
              <div className="w-2 h-2 rounded-full bg-brand-500" />
              <span className="text-[10px] font-extrabold text-text uppercase tracking-wide">
                {locale === 'ar' ? 'مطعم' : 'Restaurant'}
              </span>
            </div>
          )}
          {customerLat && (
            <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-success/30">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-extrabold text-text uppercase tracking-wide">
                {locale === 'ar' ? 'عميل' : locale === 'de' ? 'Kunde' : 'Customer'}
              </span>
            </div>
          )}
          {driverLat && (
            <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-info/30">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] font-extrabold text-text uppercase tracking-wide">
                {locale === 'ar' ? 'أنت' : locale === 'de' ? 'Sie' : 'You'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return (window as any).google.maps;
  }
  return new Promise((resolve, reject) => {
    // Timeout after 5s to ensure fallback to OSM works
    const timeout = setTimeout(() => reject(new Error('Google Maps load timeout')), 5000);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      clearTimeout(timeout);
      resolve((window as any).google.maps);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });
}

function getMarkerIcon(type: 'driver' | 'restaurant' | 'customer'): any {
  const base = 'https://maps.google.com/mapfiles/ms/icons/';
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
        fillColor: '#DC2626',
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
