'use client';

import { useEffect, useRef } from 'react';
import { PremiumMarker } from '@/components/maps/PremiumMarker';

interface Driver {
  id: string;
  name: string;
  rating: number;
  lat: number;
  lng: number;
  last_update: string;
}

interface HeatmapMapProps {
  drivers: Driver[];
}

/** Load Leaflet via CDN (consistent with other map components) */
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  return new Promise((resolve, reject) => {
    if ((window as any).L) {
      resolve((window as any).L);
      return;
    }
    // CSS
    if (!document.getElementById('leaflet-css-heatmap')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-heatmap';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }
    // JS
    const existing = document.getElementById('leaflet-js-heatmap') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L));
      existing.addEventListener('error', () => reject(new Error('Leaflet load failed')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js-heatmap';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    document.head.appendChild(script);
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('Leaflet load failed'));
  });
}

export default function HeatmapMap({ drivers }: HeatmapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    loadLeaflet()
      .then((L) => {
        if (!mounted || !containerRef.current) return;

        // Cleanup previous
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        // Default center
        const center: [number, number] = drivers.length > 0
          ? [
              drivers.reduce((sum, d) => sum + d.lat, 0) / drivers.length,
              drivers.reduce((sum, d) => sum + d.lng, 0) / drivers.length,
            ]
          : [50.1109, 8.6821];

        const map = L.map(containerRef.current).setView(center, 11);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap © CARTO',
          maxZoom: 19,
        }).addTo(map);

        // Heat circles
        for (const d of drivers) {
          const circle = L.circle([d.lat, d.lng], {
            radius: 1500,
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(map);

          const marker = L.marker([d.lat, d.lng], {
            icon: L.divIcon({
              className: 'premium-marker-driver',
              html: PremiumMarker({ type: 'driver', size: 'md', label: d.name, isActive: true }),
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            }),
          }).addTo(map);
          marker.bindPopup(`<b>${d.name}</b><br/>⭐ ${d.rating.toFixed(1)}<br/>Updated: ${new Date(d.last_update).toLocaleTimeString()}`);

          layersRef.current.push(circle, marker);
        }

        mapRef.current = map;
      })
      .catch((err) => {
        console.error('Heatmap load failed', err);
      });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [drivers]);

  return <div ref={containerRef} className="w-full h-full rounded-xl" />;
}
