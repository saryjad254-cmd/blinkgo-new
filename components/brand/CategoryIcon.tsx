/**
 * CategoryIcon — Hand-drawn SVG category icons
 *
 * Real-looking burger / pizza / sushi / pharmacy / market illustrations
 * drawn as inline SVG paths (no external image deps).
 *
 * All icons share a consistent style: bold lines, circular crop
 * (use `withCircle` prop to wrap in a circular surface).
 */

import { cn } from '@/lib/cn';

export type CategoryType = 'burger' | 'pizza' | 'sushi' | 'pharmacy' | 'market';

interface CategoryIconProps {
  type: CategoryType;
  className?: string;
}

const ICON_BG: Record<CategoryType, string> = {
  burger: 'from-[#FF8A3D] to-[#C9470B]',
  pizza:  'from-[#FFC107] to-[#C9470B]',
  sushi:  'from-[#1B1F25] to-[#0E1014]',
  pharmacy:'from-[#F7F7F5] to-[#A9ADB5]',
  market: 'from-[#22C55E] to-[#0F7C36]',
};

export function CategoryIcon({ type, className }: CategoryIconProps) {
  return (
    <div
      className={cn(
        'relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden',
        'flex items-center justify-center',
        'bg-gradient-to-br',
        ICON_BG[type],
        'shadow-[0_0_0_1px_rgba(255,255,255,0.10)]',
        className
      )}
      aria-hidden
    >
      {type === 'burger' && <BurgerIcon />}
      {type === 'pizza' && <PizzaIcon />}
      {type === 'sushi' && <SushiIcon />}
      {type === 'pharmacy' && <PharmacyIcon />}
      {type === 'market' && <MarketIcon />}
    </div>
  );
}

function BurgerIcon() {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <defs>
        <linearGradient id="cb-bun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0B870" />
          <stop offset="100%" stopColor="#C97D3A" />
        </linearGradient>
      </defs>
      {/* Top bun */}
      <ellipse cx="28" cy="22" rx="20" ry="12" fill="url(#cb-bun)" />
      {/* Sesame seeds */}
      <ellipse cx="22" cy="18" rx="1.2" ry="2" fill="#F7E6B5" />
      <ellipse cx="30" cy="15" rx="1.2" ry="2" fill="#F7E6B5" transform="rotate(20 30 15)" />
      <ellipse cx="34" cy="20" rx="1.2" ry="2" fill="#F7E6B5" transform="rotate(-15 34 20)" />
      {/* Lettuce */}
      <path d="M 9 27 Q 14 23 19 27 Q 24 23 29 27 Q 34 23 39 27 Q 44 23 47 27 L 47 31 L 9 31 Z" fill="#22C55E" />
      {/* Cheese */}
      <path d="M 9 30 L 47 30 L 47 34 L 9 34 Z" fill="#FFC107" />
      <path d="M 9 33 L 13 36 L 9 36 Z" fill="#FFC107" />
      <path d="M 47 33 L 43 36 L 47 36 Z" fill="#FFC107" />
      {/* Patty */}
      <rect x="9" y="34" width="38" height="6" fill="#5C2A0F" />
      {/* Bottom bun */}
      <ellipse cx="28" cy="40" rx="20" ry="6" fill="url(#cb-bun)" />
    </svg>
  );
}

function PizzaIcon() {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <defs>
        <radialGradient id="cp-cheese" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#FFE788" />
          <stop offset="100%" stopColor="#E6A100" />
        </radialGradient>
      </defs>
      {/* Whole pizza (background) */}
      <circle cx="28" cy="28" r="22" fill="#FFC107" />
      <circle cx="28" cy="28" r="22" fill="none" stroke="#A37C00" strokeWidth="1" />
      {/* Single slice on top */}
      <path d="M 28 6 L 50 38 L 6 38 Z" fill="url(#cp-cheese)" stroke="#A37C00" strokeWidth="1.5" />
      {/* Pepperoni */}
      <circle cx="22" cy="24" r="3" fill="#C70500" />
      <circle cx="32" cy="22" r="2.5" fill="#C70500" />
      <circle cx="28" cy="30" r="2" fill="#C70500" />
      <circle cx="20" cy="32" r="2.5" fill="#C70500" />
      <circle cx="34" cy="32" r="2" fill="#C70500" />
    </svg>
  );
}

function SushiIcon() {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <defs>
        <radialGradient id="cs-rice" cx="0.5" cy="0.4" r="0.5">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D4D4D8" />
        </radialGradient>
      </defs>
      {/* Plate */}
      <ellipse cx="28" cy="32" rx="24" ry="18" fill="#15181D" stroke="#22222A" strokeWidth="1" />
      {/* Three nigiri pieces */}
      {/* 1 */}
      <ellipse cx="16" cy="32" rx="7" ry="3.5" fill="url(#cs-rice)" />
      <ellipse cx="16" cy="29" rx="6" ry="3" fill="#FF6B6B" />
      {/* 2 */}
      <ellipse cx="28" cy="34" rx="7" ry="3.5" fill="url(#cs-rice)" />
      <ellipse cx="28" cy="31" rx="6" ry="3" fill="#FFC107" />
      {/* 3 */}
      <ellipse cx="40" cy="32" rx="7" ry="3.5" fill="url(#cs-rice)" />
      <ellipse cx="40" cy="29" rx="6" ry="3" fill="#22C55E" />
    </svg>
  );
}

function PharmacyIcon() {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <defs>
        <linearGradient id="cp-pill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F7F7F5" />
          <stop offset="100%" stopColor="#A9ADB5" />
        </linearGradient>
      </defs>
      {/* Big pill bottle */}
      <rect x="14" y="20" width="28" height="28" rx="3" fill="url(#cp-pill)" />
      <rect x="14" y="20" width="28" height="6" rx="2" fill="#08090B" />
      {/* Red cross */}
      <rect x="24" y="26" width="8" height="3" fill="#E10600" />
      <rect x="26.5" y="23.5" width="3" height="8" fill="#E10600" />
      {/* Label */}
      <rect x="18" y="32" width="20" height="2" fill="#08090B" opacity="0.4" />
      <rect x="18" y="36" width="14" height="2" fill="#08090B" opacity="0.4" />
      <rect x="18" y="40" width="18" height="2" fill="#08090B" opacity="0.4" />
      {/* Small pills beside */}
      <ellipse cx="9" cy="40" rx="4" ry="2.5" fill="#FFC107" />
      <ellipse cx="9" cy="40" rx="2" ry="2.5" fill="#F7F7F5" />
    </svg>
  );
}

function MarketIcon() {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <defs>
        <linearGradient id="cm-basket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E10600" />
          <stop offset="100%" stopColor="#5A0100" />
        </linearGradient>
      </defs>
      {/* Basket */}
      <path d="M 10 22 L 46 22 L 42 46 L 14 46 Z" fill="url(#cm-basket)" />
      {/* Handle */}
      <path d="M 18 22 Q 18 8 28 8 Q 38 8 38 22" stroke="#E10600" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Items in basket (green leaf + apple + bottle) */}
      <circle cx="20" cy="18" r="4" fill="#22C55E" />
      <circle cx="28" cy="16" r="3.5" fill="#FF6B6B" />
      <rect x="32" y="14" width="6" height="10" rx="1" fill="#FFC107" />
      <ellipse cx="36" cy="20" rx="3" ry="2" fill="#A9ADB5" />
    </svg>
  );
}
