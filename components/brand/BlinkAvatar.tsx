'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkAvatar — Official BlinkGo Avatar
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Features:
 *    - Image with auto-fallback to initials
 *    - Brand-yellow ring (default)
 *    - Online status dot
 *    - Tier badge (Bronze, Silver, Gold, Platinum)
 *    - Sizes: xs · sm · md · lg · xl · 2xl
 */

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type Tier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'vip';

interface BlinkAvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name: string;
  size?: Size;
  online?: boolean;
  tier?: Tier;
  ring?: boolean;
}

const sizeMap: Record<Size, { wrap: string; text: string; dot: string; tier: string }> = {
  xs:   { wrap: 'w-6 h-6',  text: 'text-[10px]', dot: 'w-1.5 h-1.5', tier: 'text-[8px]  px-1' },
  sm:   { wrap: 'w-8 h-8',  text: 'text-xs',     dot: 'w-2 h-2',   tier: 'text-[9px]  px-1.5' },
  md:   { wrap: 'w-10 h-10', text: 'text-sm',     dot: 'w-2.5 h-2.5', tier: 'text-[10px] px-1.5' },
  lg:   { wrap: 'w-14 h-14', text: 'text-base',   dot: 'w-3 h-3',   tier: 'text-xs     px-2' },
  xl:   { wrap: 'w-20 h-20', text: 'text-xl',     dot: 'w-3.5 h-3.5', tier: 'text-sm   px-2.5' },
  '2xl': { wrap: 'w-28 h-28', text: 'text-3xl',   dot: 'w-4 h-4',   tier: 'text-base px-3' },
};

const tierColors: Record<Tier, string> = {
  none: '',
  bronze: 'bg-brand-yellow-700 text-white',
  silver: 'bg-gray-400 text-white',
  gold: 'bg-brand-yellow text-brand-black',
  platinum: 'bg-gradient-to-br from-gray-300 to-gray-500 text-white',
  vip: 'bg-brand-red text-white',
};

const tierLabels: Record<Tier, string> = {
  none: '',
  bronze: 'B',
  silver: 'S',
  gold: 'G',
  platinum: 'P',
  vip: '★',
};

function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Stable color from name (deterministic but not random per render)
function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

export function BlinkAvatar({
  src,
  name,
  size = 'md',
  online,
  tier = 'none',
  ring = false,
  className,
  ...rest
}: BlinkAvatarProps) {
  const s = sizeMap[size];
  const initials = getInitials(name);
  const hue = nameToHue(name);

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)} {...rest}>
      <div
        className={cn(
          'relative rounded-full overflow-hidden flex items-center justify-center',
          'font-extrabold text-brand-black',
          s.wrap,
          ring && 'ring-2 ring-brand-yellow ring-offset-2 ring-offset-bg',
        )}
        style={
          src
            ? undefined
            : {
                background: `linear-gradient(135deg, hsl(${hue}, 70%, 70%), hsl(${(hue + 40) % 360}, 70%, 60%))`,
              }
        }
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className={cn(s.text)}>{initials}</span>
        )}

        {/* Online dot */}
        {online !== undefined && (
          <span
            className={cn(
              'absolute bottom-0 right-0 rounded-full border-2 border-bg',
              s.dot,
              online ? 'bg-emerald-500' : 'bg-gray-400',
            )}
            aria-label={online ? 'Online' : 'Offline'}
          />
        )}
      </div>

      {/* Tier badge */}
      {tier !== 'none' && (
        <span
          className={cn(
            'absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full mt-1',
            'rounded-full font-extrabold uppercase tracking-wide shadow-md',
            tierColors[tier],
            s.tier,
          )}
        >
          {tierLabels[tier]}
        </span>
      )}
    </div>
  );
}
