'use client';

import { type CSSProperties } from 'react';
import { Store, Home, Truck, MapPin, ShoppingBag, Pill } from 'lucide-react';
import { cn } from '@/lib/cn';

type MarkerType = 'restaurant' | 'market' | 'pharmacy' | 'customer' | 'driver' | 'pickup';

interface PremiumMarkerProps {
  type: MarkerType;
  rotation?: number;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const config: Record<MarkerType, { Icon: any; bg: string; ring: string; label: string }> = {
  restaurant: { Icon: Store,       bg: 'bg-brand-red-500',  ring: 'ring-brand-red-500/30',  label: 'Restaurant' },
  market:     { Icon: ShoppingBag, bg: 'bg-emerald',    ring: 'ring-emerald/30',    label: 'Market' },
  pharmacy:   { Icon: Pill,        bg: 'bg-info',       ring: 'ring-info/30',       label: 'Pharmacy' },
  customer:   { Icon: Home,        bg: 'bg-cyan',       ring: 'ring-cyan/30',       label: 'You' },
  driver:     { Icon: Truck,       bg: 'bg-brand-yellow-500', ring: 'ring-brand-yellow-500/40', label: 'Driver' },
  pickup:     { Icon: MapPin,      bg: 'bg-violet',     ring: 'ring-violet/30',     label: 'Pickup' },
};

const sizes = {
  sm: { wrap: 'w-8 h-8',  icon: 'w-4 h-4' },
  md: { wrap: 'w-10 h-10', icon: 'w-5 h-5' },
  lg: { wrap: 'w-12 h-12', icon: 'w-6 h-6' },
};

/**
 * Premium map marker — used by OSMMap and GoogleMap via L.divIcon.
 *
 * Returns an HTML string for Leaflet divIcon HTML property.
 *
 * Design:
 * - Colored circle with white icon
 * - White border + soft drop shadow
 * - Optional pulse ring for active markers
 * - Optional rotation (for driver heading)
 */
export function PremiumMarker({
  type,
  rotation,
  isActive = false,
  size = 'md',
  className,
  label,
}: PremiumMarkerProps) {
  const cfg = config[type];
  const s = sizes[size];
  const Icon = cfg.Icon;

  const transform = rotation != null ? `rotate(${rotation}deg)` : undefined;
  const transformStyle: CSSProperties = transform ? { transform } : {};

  const html = `
    <div style="position: relative; display: inline-flex; align-items: center; justify-content: center; ${className ? `class: ${className};` : ''}">
      ${isActive ? `
        <span style="
          position: absolute;
          inset: -8px;
          border-radius: 9999px;
          background: currentColor;
          opacity: 0.18;
          animation: blinkgo-marker-pulse 1.8s ease-out infinite;
        "></span>
      ` : ''}
      <div style="
        background: ${type === 'driver' ? '#E53935' : type === 'customer' ? '#06B6D4' : type === 'restaurant' ? '#EF4444' : type === 'market' ? '#10B981' : type === 'pharmacy' ? '#3B82F6' : '#A855F7'};
        border: 3px solid white;
        border-radius: 9999px;
        width: ${size === 'sm' ? 32 : size === 'lg' ? 48 : 40}px;
        height: ${size === 'sm' ? 32 : size === 'lg' ? 48 : 40}px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35), 0 0 0 2px rgba(0,0,0,0.06);
        color: white;
        ${transform ? `transform: ${transform};` : ''}
        position: relative;
        z-index: 1;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="${size === 'sm' ? 14 : size === 'lg' ? 22 : 18}" height="${size === 'sm' ? 14 : size === 'lg' ? 22 : 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${getIconPath(type)}
        </svg>
      </div>
      ${label ? `
        <div style="
          position: absolute;
          top: ${size === 'sm' ? 38 : size === 'lg' ? 56 : 48}px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.85);
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          backdrop-filter: blur(8px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">${label}</div>
      ` : ''}
    </div>
    <style>
      @keyframes blinkgo-marker-pulse {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(2); opacity: 0; }
      }
    </style>
  `;

  return html;
}

function getIconPath(type: MarkerType): string {
  switch (type) {
    case 'restaurant':
      return '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>';
    case 'market':
      return '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
    case 'pharmacy':
      return '<path d="M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5"/><path d="M12 11v6"/><path d="M9 14h6"/>';
    case 'customer':
      return '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>';
    case 'driver':
      return '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';
    case 'pickup':
      return '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>';
  }
}
