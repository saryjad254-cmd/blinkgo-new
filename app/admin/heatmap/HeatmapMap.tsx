'use client';

import { useEffect, useRef } from 'react';
import { PremiumMarker } from '@/components/maps/PremiumMarker';
import { loadLeaflet } from '@/lib/maps/load-leaflet';
import type { Layer, Map as LeafletMap } from 'leaflet';

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

export default function HeatmapMap({ drivers }: HeatmapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Layer[]>([]);

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
