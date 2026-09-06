'use client';

import { useEffect, useRef, useState } from 'react';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import {
  loadGoogleMaps,
  GOOGLE_MAPS_API_KEY,
  DEFAULT_MAP_OPTIONS,
  MARKER_ICONS,
  createGoogleMarker,
  createGoogleMarkerVisual,
  removeGoogleMarker,
  updateGoogleMarker,
  type GoogleMarkerInstance,
} from '@/lib/maps/google-maps';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { decodePolyline } from '@/lib/maps/route-engine';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type?: 'restaurant' | 'customer' | 'driver' | 'market' | 'pharmacy';
  title?: string;
  info?: string;
}

interface Props {
  /** Center of the map (lat, lng) */
  center?: { lat: number; lng: number };
  /** Default zoom (1-20) */
  zoom?: number;
  /** Markers to display */
  markers?: MapMarker[];
  /** Whether to allow map click to place a marker */
  selectable?: boolean;
  /** Callback when a position is selected (lat/lng) */
  onSelect?: (lat: number, lng: number) => void;
  /** Show directions between two points (origin, destination) */
  directions?: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  };
  /** Map height CSS */
  height?: string;
  /** Whether to show user's current location */
  showUserLocation?: boolean;
}

export function GoogleMap({
  center,
  zoom = 13,
  markers = [],
  selectable = false,
  onSelect,
  directions,
  height = '400px',
  showUserLocation = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, GoogleMarkerInstance>>(new Map());
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const fallbackPolylineRef = useRef<google.maps.Polyline | null>(null);
  const userMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const onSelectRef = useRef(onSelect);
  const initialConfigRef = useRef({
    center,
    zoom,
    selectable,
    showUserLocation,
    addressTitle: t.customer.address,
  });

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    const markerRegistry = markersRef.current;

    async function init() {
      if (!GOOGLE_MAPS_API_KEY) {
        setError('Google Maps API key not configured');
        setLoading(false);
        return;
      }
      try {
        await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const config = initialConfigRef.current;
        const initialCenter = config.center || { lat: 50.7374, lng: 7.0982 };
        mapRef.current = new google.maps.Map(containerRef.current, {
          ...DEFAULT_MAP_OPTIONS,
          center: initialCenter,
          zoom: config.zoom,
        });

        if (config.selectable) {
          mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng && onSelectRef.current) {
              onSelectRef.current(e.latLng.lat(), e.latLng.lng());
            }
          });
        }

        // Show user location
        if (config.showUserLocation && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mapRef.current) return;
              const pos_lat = pos.coords.latitude;
              const pos_lng = pos.coords.longitude;
              if (userMarkerRef.current) removeGoogleMarker(userMarkerRef.current);
              userMarkerRef.current = createGoogleMarker({
                position: { lat: pos_lat, lng: pos_lng },
                map: mapRef.current,
                legacyIcon: MARKER_ICONS.customer,
                content: createGoogleMarkerVisual(MARKER_ICONS.customer),
                title: config.addressTitle,
              });
            },
            () => {/* permission denied - ignore */},
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }

        setMapReady(true);
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load Google Maps');
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      setMapReady(false);
      markerRegistry.forEach(removeGoogleMarker);
      markerRegistry.clear();
      if (userMarkerRef.current) removeGoogleMarker(userMarkerRef.current);
      userMarkerRef.current = null;
      routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
      routePolylinesRef.current = [];
      fallbackPolylineRef.current?.setMap(null);
      fallbackPolylineRef.current = null;
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove old markers not in new set
    const incomingIds = new Set(markers.map((m) => m.id));
    markersRef.current.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        removeGoogleMarker(marker);
        markersRef.current.delete(id);
      }
    });

    // Add/update new markers
    markers.forEach((m) => {
      const existing = markersRef.current.get(m.id);
      if (existing) {
        updateGoogleMarker(existing, { lat: m.lat, lng: m.lng }, m.title);
      } else {
        const marker = createGoogleMarker({
          position: { lat: m.lat, lng: m.lng },
          map,
          legacyIcon: MARKER_ICONS[m.type || 'restaurant'],
          content: createGoogleMarkerVisual(MARKER_ICONS[m.type || 'restaurant']),
          title: m.title,
          clickable: Boolean(m.info),
        });
        if (m.info) {
          const content = document.createElement('div');
          content.style.cssText = 'color:#0a0a0f;font-family:system-ui';
          const heading = document.createElement('strong');
          heading.textContent = m.title || '';
          const detail = document.createElement('div');
          detail.textContent = m.info;
          content.append(heading, detail);
          const infoWindow = new google.maps.InfoWindow({
            content,
          });
          marker.addListener('click', () => {
            infoWindow.open({ map, anchor: marker });
          });
        }
        markersRef.current.set(m.id, marker);
      }
    });

    // Auto-fit bounds if multiple markers
    if (markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      map.fitBounds(bounds);
    } else if (markers.length === 1) {
      map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
    }
  }, [markers, mapReady]);

  // Update directions
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let cancelled = false;

    routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
    routePolylinesRef.current = [];
    if (fallbackPolylineRef.current) {
      fallbackPolylineRef.current.setMap(null);
      fallbackPolylineRef.current = null;
    }

    if (!directions) return () => { cancelled = true; };

    const drawFallback = () => {
      if (cancelled || !mapRef.current) return;
      fallbackPolylineRef.current = new google.maps.Polyline({
        path: [directions.origin, directions.destination],
        geodesic: true,
        strokeColor: '#FF6B00',
        strokeOpacity: 0.7,
        strokeWeight: 4,
        map: mapRef.current,
      });
    };

    void (async () => {
      try {
        // Route through our server so provider credentials, quota failures and
        // fallbacks stay controlled by BlinkGo instead of surfacing as browser
        // console errors. The API returns a Haversine fallback when Google
        // Directions is unavailable.
        const response = await fetch('/api/maps/geocode', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'directions',
            origin: directions.origin,
            destination: directions.destination,
            mode: 'driving',
          }),
        });
        if (!response.ok) throw new Error('Route request failed');
        const payload = await response.json() as {
          ok?: boolean;
          data?: { polyline?: string };
        };
        if (cancelled || !mapRef.current) return;
        const encodedPath = payload.ok ? payload.data?.polyline : undefined;
        const path = encodedPath ? decodePolyline(encodedPath) : [];
        if (path.length < 2) {
          drawFallback();
          return;
        }
        const routePolyline = new google.maps.Polyline({
          path,
          strokeColor: '#FF6B00',
          strokeWeight: 5,
          strokeOpacity: 0.9,
          map: mapRef.current,
        });
        routePolylinesRef.current = [routePolyline];
      } catch {
        drawFallback();
      }
    })();

    return () => {
      cancelled = true;
      routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
      routePolylinesRef.current = [];
      fallbackPolylineRef.current?.setMap(null);
      fallbackPolylineRef.current = null;
    };
  }, [directions, mapReady]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-surface-elevated rounded-md p-6 text-center"
        style={{ height }}
      >
        <AlertTriangle className="w-8 h-8 text-warning mb-2" />
        <p className="text-sm text-white font-semibold mb-1">{t.errors.notFound}</p>
        <p className="text-xs text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="blinkgo-google-map relative rounded-md overflow-hidden border border-edge-light" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-white">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t.common.loading}</span>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {selectable && !loading && (
        <div className="absolute top-2 left-2 z-10 bg-bg/90 backdrop-blur-sm rounded-md px-3 py-1.5 text-xs text-white border border-edge-light">
          <MapPin className="w-3 h-3 inline me-1" />
          {t.customer.address}
        </div>
      )}
    </div>
  );
}
