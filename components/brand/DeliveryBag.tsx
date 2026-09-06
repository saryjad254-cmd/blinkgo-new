/**
 * DeliveryBag — Side drawer "Deliver with BlinkGo" promo asset
 *
 * Red insulated delivery bag with BlinkGo wordmark and speed lines.
 * Used in: SideDrawer promo card.
 */

import { cn } from '@/lib/cn';

interface DeliveryBagProps {
  className?: string;
}

export function DeliveryBag({ className }: DeliveryBagProps) {
  return (
    <svg
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="db-bag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E10600" />
          <stop offset="50%" stopColor="#C70500" />
          <stop offset="100%" stopColor="#5A0100" />
        </linearGradient>
        <linearGradient id="db-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF2A2A" />
          <stop offset="100%" stopColor="#A30500" />
        </linearGradient>
        <linearGradient id="db-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFC107" />
          <stop offset="100%" stopColor="#CC9D00" />
        </linearGradient>
      </defs>
      {/* Speed lines behind */}
      <path d="M 0 80 L 50 80 L 56 96 L 0 96 Z" fill="#FFC107" />
      <path d="M 0 116 L 36 116 L 42 132 L 0 132 Z" fill="#FFC107" opacity="0.6" />
      {/* Handle (yellow strap) */}
      <path
        d="M 60 50 Q 100 18 140 50"
        stroke="url(#db-handle)"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 60 50 Q 100 22 140 50"
        stroke="#E10600"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Bag top cap (yellow trim) */}
      <rect x="48" y="58" width="104" height="14" rx="3" fill="#FFC107" />
      <rect x="50" y="60" width="100" height="3" rx="1" fill="#E10600" opacity="0.4" />
      {/* Bag main body */}
      <rect x="40" y="68" width="120" height="158" rx="8" fill="url(#db-bag)" />
      {/* Front pocket */}
      <rect x="56" y="100" width="88" height="100" rx="4" fill="url(#db-front)" stroke="#FFC107" strokeWidth="1.5" />
      {/* Zipper line */}
      <line x1="58" y1="108" x2="142" y2="108" stroke="#FFC107" strokeWidth="1" strokeDasharray="2 2" />
      {/* "BlinkGo" wordmark on pocket */}
      <text x="100" y="142" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="900" fill="#FFC107">Blink</text>
      <text x="100" y="166" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="900" fill="#FFC107">Go</text>
      {/* Side stitching highlight */}
      <line x1="40" y1="68" x2="40" y2="226" stroke="#FFC107" strokeWidth="1" opacity="0.3" />
      <line x1="160" y1="68" x2="160" y2="226" stroke="#FFC107" strokeWidth="1" opacity="0.3" />
      {/* Bottom shadow */}
      <ellipse cx="100" cy="232" rx="60" ry="6" fill="#000" opacity="0.4" />
    </svg>
  );
}
