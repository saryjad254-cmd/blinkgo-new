/**
 * BlinkGoWordmarkWhite — White rider on white logo
 * For the LOGIN hero overlay
 *
 * White motorcycle rider + speed lines + "BlinkGo" wordmark
 * (white "Blink" + red "Go")
 */

import { cn } from '@/lib/cn';

interface BlinkGoWordmarkWhiteProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: { wordmark: 'text-lg', icon: 32 },
  md: { wordmark: 'text-2xl', icon: 48 },
  lg: { wordmark: 'text-3xl', icon: 64 },
  xl: { wordmark: 'text-4xl', icon: 80 },
};

export function BlinkGoWordmarkWhite({
  className,
  size = 'lg',
}: BlinkGoWordmarkWhiteProps) {
  const s = sizeMap[size];
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      {/* White rider + wordmark */}
      <div className="flex items-center gap-2.5">
        {/* White motorcycle rider SVG */}
        <svg
          viewBox="0 0 120 80"
          width={s.icon * 1.5}
          height={s.icon}
          className="shrink-0"
          aria-hidden
        >
          {/* Red speed lines (left streaks) */}
          <path
            d="M 0 22 L 50 22 L 56 30 L 0 30 Z"
            fill="#E10600"
            opacity="0.95"
          />
          <path
            d="M 0 36 L 38 36 L 44 44 L 0 44 Z"
            fill="#E10600"
            opacity="0.7"
          />
          <path
            d="M 0 50 L 26 50 L 32 58 L 0 58 Z"
            fill="#E10600"
            opacity="0.5"
          />
          {/* White rider on bike (simplified silhouette) */}
          <circle cx="78" cy="22" r="9" fill="#FFFFFF" />
          <path
            d="M 70 30 L 88 30 L 92 50 L 66 50 Z"
            fill="#FFFFFF"
          />
          <path
            d="M 84 36 L 110 36 L 110 42 L 84 42 Z"
            fill="#FFFFFF"
          />
          {/* Bike body */}
          <path
            d="M 60 52 L 100 52 L 106 60 L 56 60 Z"
            fill="#FFFFFF"
          />
          {/* Wheels (rings) */}
          <circle
            cx="68"
            cy="70"
            r="10"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
          <circle cx="68" cy="70" r="3" fill="#FFFFFF" />
          <circle
            cx="98"
            cy="70"
            r="10"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
          <circle cx="98" cy="70" r="3" fill="#FFFFFF" />
        </svg>
        {/* Wordmark */}
        <span
          className={cn(
            'font-extrabold leading-none tracking-tight',
            s.wordmark
          )}
        >
          <span className="text-white italic">Blink</span>
          <span className="text-brand italic">Go</span>
        </span>
      </div>
    </div>
  );
}
