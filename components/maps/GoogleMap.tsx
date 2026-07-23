'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, MapPin } from 'lucide-react';
import {
  loadGoogleMaps,
  GOOGLE_MAPS_API_KEY,
  DEFAULT_MAP_OPTIONS,
  MARKER_ICONS,
} from '@/lib/maps/google-maps';
import { useI18n } from '@/lib/i18n/I18nProvider';

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
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!GOOGLE_MAPS_API_KEY) {
        setError('Google Maps API key not configured');
        setLoading(false);
        return;
      }
      try {
        await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const initialCenter = center || { lat: 50.7374, lng: 7.0982 };
        mapRef.current = new google.maps.Map(containerRef.current, {
          ...DEFAULT_MAP_OPTIONS,
          center: initialCenter,
          zoom,
        });

        if (selectable) {
          mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng && onSelect) {
              onSelect(e.latLng.lat(), e.latLng.lng());
            }
          });
        }

        // Show user location
        if (showUserLocation && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const pos_lat = pos.coords.latitude;
              const pos_lng = pos.coords.longitude;
              if (userMarkerRef.current) userMarkerRef.current.setMap(null);
              userMarkerRef.current = new google.maps.Marker({
                position: { lat: pos_lat, lng: pos_lng },
                map: mapRef.current,
                icon: MARKER_ICONS.customer,
                title: t.customer.address,
              });
            },
            () => {/* permission denied - ignore */},
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }

        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to load Google Maps');
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers not in new set
    const incomingIds = new Set(markers.map((m) => m.id));
    markersRef.current.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    // Add/update new markers
    markers.forEach((m) => {
      const existing = markersRef.current.get(m.id);
      if (existing) {
        existing.setPosition({ lat: m.lat, lng: m.lng });
        if (m.title) existing.setTitle(m.title);
      } else {
        const marker = new google.maps.Marker({
          position: { lat: m.lat, lng: m.lng },
          map: mapRef.current,
          icon: MARKER_ICONS[m.type || 'restaurant'],
          title: m.title,
        });
        if (m.info) {
          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="color:#0a0a0f;font-family:system-ui"><strong>${m.title || ''}</strong><br/>${m.info}</div>`,
          });
          marker.addListener('click', () => {
            infoWindow.open(mapRef.current, marker);
          });
        }
        markersRef.current.set(m.id, marker);
      }
    });

    // Auto-fit bounds if multiple markers
    if (markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      mapRef.current.fitBounds(bounds);
    } else if (markers.length === 1) {
      mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
    }
  }, [markers]);

  // Update directions
  useEffect(() => {
    if (!mapRef.current) return;

    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    if (!directions) return;

    const directionsService = new google.maps.DirectionsService();
    const renderer = new google.maps.DirectionsRenderer({
      map: mapRef.current,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#FF6B00',
        strokeWeight: 5,
        strokeOpacity: 0.9,
      },
    });
    directionsRendererRef.current = renderer;

    directionsService.route(
      {
        origin: directions.origin,
        destination: directions.destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          renderer.setDirections(result);
        } else {
          // Fallback: draw straight line if Directions API not enabled
          const line = new google.maps.Polyline({
            path: [
              directions.origin,
              directions.destination,
            ],
            geodesic: true,
            strokeColor: '#FF6B00',
            strokeOpacity: 0.7,
            strokeWeight: 4,
            map: mapRef.current,
          });
        }
      }
    );
  }, [directions]);

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
    <div className="relative rounded-md overflow-hidden border border-edge-light" style={{ height }}>
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
        <div className="absolute top-2 start-2 z-10 bg-bg/90 backdrop-blur-sm rounded-md px-3 py-1.5 text-xs text-white border border-edge-light">
          <MapPin className="w-3 h-3 inline me-1" />
          {t.customer.address}
        </div>
      )}
    </div>
  );
}