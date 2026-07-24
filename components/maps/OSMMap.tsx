'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type?: 'restaurant' | 'customer' | 'driver' | 'market' | 'pharmacy';
  title?: string;
  info?: string;
  /** Driver marker bearing in degrees (0-360) */
  rotation?: number;
  /** Driver marker speed in m/s */
  speed?: number | null;
  /** Driver marker accuracy in meters */
  accuracy?: number | null;
  /** Marker size */
  size?: 'sm' | 'md' | 'lg';
  /** Click handler for this marker (admin maps) */
  onClick?: () => void;
  /** Visual flag (e.g. on_delivery) */
  is_on_delivery?: boolean;
}

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  height?: string;
}

/**
 * OpenStreetMap-based map (no API key required).
 * Fallback when Google Maps API is unavailable or key is invalid.
 */
export function OSMMap({ center, zoom = 14, markers = [], height = '400px' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load Leaflet CSS + JS dynamically
        if (!(window as any).L) {
          // CSS
          if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
            link.crossOrigin = '';
            document.head.appendChild(link);
          }
          // JS
          await new Promise<void>((resolve, reject) => {
            const existing = document.getElementById('leaflet-js') as HTMLScriptElement | null;
            if (existing && (window as any).L) {
              resolve();
              return;
            }
            if (existing) {
              existing.addEventListener('load', () => resolve());
              existing.addEventListener('error', () => reject(new Error('Failed to load Leaflet')));
              return;
            }
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
            script.crossOrigin = '';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Leaflet'));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !containerRef.current) return;

        const L = (window as any).L;
        const initialCenter = center || { lat: 50.7374, lng: 7.0982 };

        const map = L.map(containerRef.current, {
          center: [initialCenter.lat, initialCenter.lng],
          zoom,
          zoomControl: true,
          attributionControl: true,
        });

        // Dark tiles (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors © CARTO',
          maxZoom: 19,
        }).addTo(map);

        // Add markers
        const allMarkers: any[] = [];
        markers.forEach((m) => {
          const type = m.type || 'restaurant';
          const isBusyDriver = type === 'driver' && m.is_on_delivery;
          const size = m.size || 'md';
          const sizePx = size === 'sm' ? 32 : size === 'lg' ? 48 : 40;
          const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

          // Type-based colors
          const colorMap: Record<string, string> = {
            restaurant: '#EF4444',
            market: '#10B981',
            pharmacy: '#3B82F6',
            customer: '#06B6D4',
            driver: isBusyDriver ? '#DC2626' : '#E53935',
            pickup: '#A855F7',
          };
          const bg = colorMap[type] || colorMap.restaurant;

          // Icon SVG paths
          const iconPaths: Record<string, string> = {
            restaurant: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
            market: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
            pharmacy: '<path d="M12 11v6M9 14h6"/>',
            customer: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
            driver: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
            pickup: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
          };

          const transform = m.rotation != null
            ? `transform: rotate(${m.rotation}deg);`
            : '';
          const pulse = isBusyDriver
            ? `<span style="
                position: absolute;
                inset: -6px;
                border-radius: 50%;
                background: #DC2626;
                opacity: 0.3;
                animation: blinkgo-pulse 1.4s ease-out infinite;
              "></span>`
            : '';
          const html = `
            <div style="position: relative; display: inline-block;">
              ${pulse}
              <div style="
                background: ${bg};
                border: 3px solid white;
                border-radius: 50%;
                width: ${sizePx}px;
                height: ${sizePx}px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.35), 0 0 0 2px rgba(0,0,0,0.06);
                color: white;
                ${transform}
                position: relative;
                z-index: 1;
              ">
                <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  ${iconPaths[type] || iconPaths.restaurant}
                </svg>
              </div>
              ${m.title ? `
                <div style="
                  position: absolute;
                  top: ${sizePx + 6}px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: rgba(10,10,14,0.92);
                  color: white;
                  padding: 4px 8px;
                  border-radius: 6px;
                  font-size: 11px;
                  font-weight: 600;
                  white-space: nowrap;
                  backdrop-filter: blur(8px);
                  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                ">${m.title}</div>
              ` : ''}
            </div>
            <style>
              @keyframes blinkgo-pulse {
                0% { transform: scale(1); opacity: 0.5; }
                100% { transform: scale(2.5); opacity: 0; }
              }
            </style>
          `;
          const leafletIcon = L.divIcon({
            html,
            className: 'custom-marker',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          const marker = L.marker([m.lat, m.lng], { icon: leafletIcon }).addTo(map);
          if (m.title || m.info) {
            marker.bindPopup(`<b>${m.title || m.type || 'Location'}</b>${m.info ? `<br>${m.info}` : ''}`);
          }
          if (m.onClick) {
            marker.on('click', () => m.onClick?.());
          }
          allMarkers.push(marker);
        });

        // Fit bounds if multiple markers
        if (markers.length > 1) {
          const bounds = L.latLngBounds(allMarkers.map((m) => m.getLatLng()));
          map.fitBounds(bounds, { padding: [50, 50] });
        }

        mapRef.current = map;
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load map');
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
      }
    };
  }, [center?.lat, center?.lng, zoom]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-surface-elevated rounded-md p-6 text-center border border-edge-light"
        style={{ height }}
      >
        <AlertTriangle className="w-8 h-8 text-warning mb-2" />
        <p className="text-sm text-white font-semibold mb-1">Map error</p>
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
            <span className="text-sm">Loading map...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
