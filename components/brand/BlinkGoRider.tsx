/**
 * BlinkGoRider — Premium brand asset
 *
 * Inline SVG illustration of a delivery rider on a yellow+red scooter.
 * Used in:
 *  - AppHeader (small variant, header wordmark)
 *  - SideDrawer banner (medium variant)
 *  - Home hero banner (large variant, full art)
 *
 * Variants: header / drawer / hero — controls size and detail level
 *
 * All art is hand-drawn SVG paths — no raster, no external deps.
 */

import { cn } from '@/lib/cn';

interface BlinkGoRiderProps {
  variant?: 'header' | 'drawer' | 'hero';
  className?: string;
}

export function BlinkGoRider({ variant = 'header', className }: BlinkGoRiderProps) {
  if (variant === 'header') {
    return (
      <svg
        viewBox="0 0 200 130"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('shrink-0', className)}
        aria-hidden
      >
        <defs>
          <linearGradient id="rh-scooter" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#FF8A00" />
          </linearGradient>
          <linearGradient id="rh-box" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E10600" />
            <stop offset="100%" stopColor="#7A0300" />
          </linearGradient>
        </defs>
        {/* Speed lines (yellow streaks) */}
        <path d="M 0 38 L 78 38 L 82 46 L 0 46 Z" fill="#FFC107" />
        <path d="M 0 56 L 64 56 L 68 64 L 0 64 Z" fill="#FFC107" opacity="0.65" />
        <path d="M 0 74 L 50 74 L 54 82 L 0 82 Z" fill="#FFC107" opacity="0.4" />
        {/* Delivery box on back */}
        <rect x="74" y="36" width="50" height="38" rx="4" fill="url(#rh-box)" />
        <text x="99" y="62" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="900" fill="#FFC107">B</text>
        {/* Rider body (simplified) */}
        <circle cx="118" cy="50" r="9" fill="#1a1a1a" />
        <rect x="113" y="56" width="11" height="14" rx="3" fill="#1a1a1a" />
        {/* Scooter body */}
        <path d="M 100 78 L 168 78 L 175 88 L 95 88 Z" fill="url(#rh-scooter)" />
        <rect x="155" y="70" width="20" height="14" rx="3" fill="#1a1a1a" />
        {/* Wheels */}
        <circle cx="108" cy="100" r="11" fill="#08090B" stroke="#E10600" strokeWidth="2.5" />
        <circle cx="108" cy="100" r="3" fill="#E10600" />
        <circle cx="160" cy="100" r="11" fill="#08090B" stroke="#E10600" strokeWidth="2.5" />
        <circle cx="160" cy="100" r="3" fill="#E10600" />
        {/* Handlebar */}
        <path d="M 145 70 L 162 56 L 175 56" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="145" cy="70" r="3" fill="#FFC107" />
      </svg>
    );
  }

  if (variant === 'drawer') {
    return (
      <svg
        viewBox="0 0 320 200"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('shrink-0', className)}
        aria-hidden
      >
        <defs>
          <linearGradient id="rd-scooter" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#FF8A00" />
          </linearGradient>
          <linearGradient id="rd-box" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E10600" />
            <stop offset="100%" stopColor="#5A0100" />
          </linearGradient>
        </defs>
        {/* Speed lines */}
        <path d="M 0 60 L 130 60 L 136 72 L 0 72 Z" fill="#FFC107" />
        <path d="M 0 86 L 100 86 L 106 98 L 0 98 Z" fill="#FFC107" opacity="0.6" />
        <path d="M 0 112 L 75 112 L 81 124 L 0 124 Z" fill="#FFC107" opacity="0.4" />
        {/* Delivery box */}
        <rect x="120" y="55" width="84" height="64" rx="6" fill="url(#rd-box)" stroke="#FFC107" strokeWidth="2" />
        <text x="162" y="98" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="38" fontWeight="900" fill="#FFC107">B</text>
        {/* Rider head */}
        <circle cx="195" cy="80" r="15" fill="#1a1a1a" />
        {/* Helmet visor */}
        <path d="M 184 76 Q 195 64 206 76 L 206 84 L 184 84 Z" fill="#FFC107" opacity="0.4" />
        {/* Rider body */}
        <rect x="186" y="92" width="18" height="22" rx="5" fill="#1a1a1a" />
        {/* Arm */}
        <rect x="200" y="100" width="20" height="6" rx="3" fill="#1a1a1a" transform="rotate(-15 210 103)" />
        {/* Scooter body */}
        <path d="M 165 130 L 280 130 L 290 144 L 158 144 Z" fill="url(#rd-scooter)" />
        <rect x="258" y="118" width="32" height="22" rx="4" fill="#1a1a1a" />
        {/* Wheels */}
        <circle cx="178" cy="160" r="18" fill="#08090B" stroke="#E10600" strokeWidth="3" />
        <circle cx="178" cy="160" r="5" fill="#E10600" />
        <circle cx="262" cy="160" r="18" fill="#08090B" stroke="#E10600" strokeWidth="3" />
        <circle cx="262" cy="160" r="5" fill="#E10600" />
        {/* Handlebar */}
        <path d="M 240 118 L 264 96 L 285 96" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="240" cy="118" r="4" fill="#FFC107" />
      </svg>
    );
  }

  // hero — large detailed illustration
  return (
    <svg
      viewBox="0 0 400 280"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="rh-scooter" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC107" />
          <stop offset="100%" stopColor="#FF8A00" />
        </linearGradient>
        <linearGradient id="rh-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E10600" />
          <stop offset="100%" stopColor="#5A0100" />
        </linearGradient>
        <linearGradient id="rh-rider" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
      </defs>
      {/* Speed lines (large, behind) */}
      <path d="M 0 80 L 170 80 L 178 96 L 0 96 Z" fill="#FFC107" />
      <path d="M 0 116 L 130 116 L 138 132 L 0 132 Z" fill="#FFC107" opacity="0.7" />
      <path d="M 0 152 L 100 152 L 108 168 L 0 168 Z" fill="#FFC107" opacity="0.45" />
      <path d="M 0 188 L 70 188 L 78 204 L 0 204 Z" fill="#FFC107" opacity="0.3" />
      {/* Delivery box on back */}
      <rect x="160" y="74" width="110" height="84" rx="8" fill="url(#rh-box)" stroke="#FFC107" strokeWidth="2.5" />
      <text x="215" y="132" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="48" fontWeight="900" fill="#FFC107">B</text>
      {/* Rider head + helmet */}
      <ellipse cx="250" cy="106" rx="20" ry="22" fill="url(#rh-rider)" />
      {/* Visor */}
      <path d="M 232 100 Q 250 84 268 100 L 268 112 L 232 112 Z" fill="#FFC107" opacity="0.35" />
      <rect x="234" y="100" width="34" height="3" rx="1.5" fill="#FFC107" />
      {/* Rider body */}
      <path d="M 240 124 L 264 124 L 270 162 L 234 162 Z" fill="url(#rh-rider)" />
      {/* Arm reaching forward */}
      <path d="M 264 130 L 308 116 L 312 124 L 268 142 Z" fill="url(#rh-rider)" />
      {/* Scooter body */}
      <path d="M 220 180 L 360 180 L 372 198 L 210 198 Z" fill="url(#rh-scooter)" />
      <rect x="335" y="166" width="42" height="28" rx="5" fill="#1a1a1a" />
      {/* Headlight */}
      <circle cx="358" cy="180" r="6" fill="#FFC107" />
      <circle cx="358" cy="180" r="3" fill="#FFFBEA" />
      {/* Wheels */}
      <circle cx="232" cy="220" r="24" fill="#08090B" stroke="#E10600" strokeWidth="4" />
      <circle cx="232" cy="220" r="14" fill="none" stroke="#E10600" strokeWidth="1.5" />
      <circle cx="232" cy="220" r="6" fill="#E10600" />
      <circle cx="338" cy="220" r="24" fill="#08090B" stroke="#E10600" strokeWidth="4" />
      <circle cx="338" cy="220" r="14" fill="none" stroke="#E10600" strokeWidth="1.5" />
      <circle cx="338" cy="220" r="6" fill="#E10600" />
      {/* Handlebar */}
      <path d="M 312 166 L 342 138 L 372 138" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="312" cy="166" r="5" fill="#FFC107" />
      {/* Footrest */}
      <rect x="270" y="186" width="22" height="4" rx="2" fill="#1a1a1a" />
    </svg>
  );
}
