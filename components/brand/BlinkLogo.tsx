import { cn } from '@/lib/cn';
import Image from 'next/image';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkLogo — Official BlinkGo Logo (USES THE EXACT SOURCE LOGO IMAGE)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  This component uses the EXACT official logo image that was uploaded
 *  by the project owner. The logo image is the single source of truth.
 *  DO NOT redesign, reinterpret, or modify this logo.
 *
 *  v85 FIX: Made the logo properly responsive. The `size` prop now maps
 *  to RECOMMENDED max-width in pixels (preserving aspect ratio) and
 *  the image is `object-contain` so it NEVER crops. The className
 *  passed in controls the actual rendered size.
 *
 *  Variants:
 *    - full       The complete official logo image
 *    - horizontal The logo image with custom width (for nav)
 *    - mark       A simplified "B" mark (for tight spaces)
 *    - wordmark   "BlinkGo" text only
 */

interface BlinkLogoProps {
  variant?: 'full' | 'horizontal' | 'mark' | 'wordmark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'hero';
  className?: string;
  /** Width override in pixels */
  width?: number;
  /** Height override in pixels */
  height?: number;
  /** Use the 3D rendered version instead of the flat version */
  threeD?: boolean;
  /** Use the icon-only version (just the B mark on yellow circle) */
  iconOnly?: boolean;
}

// Logo source dimensions (preserved for next/image optimization)
const LOGO_W = 2752;
const LOGO_H = 1536;
const ICON_W = 2048;
const ICON_H = 2048;

// Recommended max-width per size. Use `className="w-32 h-auto"` etc. at
// the call site to actually size the rendered logo. The internal sizing
// here is a hint for intrinsic aspect ratio.
const sizeMap = {
  xs:   { intrinsicW: 60,   intrinsicH: 60,   text: 'text-base'   },
  sm:   { intrinsicW: 100,  intrinsicH: 100,  text: 'text-lg'     },
  md:   { intrinsicW: 140,  intrinsicH: 140,  text: 'text-xl'     },
  lg:   { intrinsicW: 200,  intrinsicH: 200,  text: 'text-2xl'    },
  xl:   { intrinsicW: 280,  intrinsicH: 280,  text: 'text-3xl'    },
  '2xl': { intrinsicW: 380,  intrinsicH: 380,  text: 'text-4xl'    },
  '3xl': { intrinsicW: 480,  intrinsicH: 480,  text: 'text-5xl'    },
  hero: { intrinsicW: 480,  intrinsicH: 480,  text: 'text-6xl'    },
};

/**
 * THE OFFICIAL LOGO — uses the exact source image.
 * v85: Now defaults to `width: 100%` when no className is provided, and
 * uses `sizes` correctly for responsive images. The intrinsic aspect
 * ratio is preserved (object-contain), so the logo NEVER crops.
 */
function OfficialLogo({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes = '(max-width: 640px) 70vw, (max-width: 1024px) 50vw, 480px',
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={cn('object-contain w-full h-auto max-w-full', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}

export function BlinkLogo({
  variant = 'full',
  size = 'md',
  className,
  width,
  height,
  threeD = false,
  iconOnly = false,
}: BlinkLogoProps) {
  void width; void height; // keep for API compat
  const s = sizeMap[size];

  // Use the official image (3D rendered or flat)
  const logoSrc = threeD ? '/brand/blinkgo-3d.png' : '/brand/blinkgo-logo.png';
  const iconSrc = '/brand/blinkgo-icon.png';

  // `priority` is set on the largest variant (lg and above) — these are
  // the LCP candidates on login, welcome, and splash.
  const isLcpCandidate = s.intrinsicW >= 200;

  if (iconOnly || variant === 'mark') {
    return (
      <OfficialLogo
        src={iconSrc}
        alt="BlinkGo"
        width={ICON_W}
        height={ICON_H}
        className={cn(className)}
        priority={isLcpCandidate}
        sizes="(max-width: 640px) 40px, (max-width: 1024px) 60px, 100px"
      />
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={cn('inline-flex flex-col items-center', className)}>
        <OfficialLogo
          src={iconSrc}
          alt="BlinkGo"
          width={ICON_W}
          height={ICON_H}
          priority={isLcpCandidate}
        />
        <span className="mt-1 text-[10px] font-bold tracking-widest text-text-muted uppercase">
          Schnell · Zuverlässig · Für Dich
        </span>
      </div>
    );
  }

  // full / horizontal — use the official combined logo image
  // v85: Use a `sizes` attribute that responds to the actual rendered size.
  // For 'md' (used in nav, ~140px), use '140px'. For larger sizes, scale up.
  const sizes = s.intrinsicW >= 400
    ? '(max-width: 640px) 70vw, (max-width: 1024px) 50vw, 480px'
    : s.intrinsicW >= 200
    ? '(max-width: 640px) 50vw, 200px'
    : '140px';

  return (
    <OfficialLogo
      src={logoSrc}
      alt="BlinkGo — Schnell. Zuverlässig. Für Dich."
      width={LOGO_W}
      height={LOGO_H}
      className={cn(className)}
      priority={isLcpCandidate}
      sizes={sizes}
    />
  );
}
