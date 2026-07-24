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
 *  The official logo image is stored at: /brand/blinkgo-logo.png
 *  (combined version with full design: rider + wordmark + tagline)
 *
 *  Variants:
 *    - full       The complete official logo image
 *    - horizontal The logo image with custom width
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

const sizeMap = {
  xs:   { w: 60,   h: 60,   text: 'text-base'   },
  sm:   { w: 100,  h: 100,  text: 'text-lg'     },
  md:   { w: 140,  h: 140,  text: 'text-xl'     },
  lg:   { w: 200,  h: 200,  text: 'text-2xl'    },
  xl:   { w: 280,  h: 280,  text: 'text-3xl'    },
  '2xl': { w: 380,  h: 380,  text: 'text-4xl'    },
  '3xl': { w: 500,  h: 500,  text: 'text-5xl'    },
  hero: { w: 800,  h: 800,  text: 'text-6xl'    },
};

/**
 * THE OFFICIAL LOGO — uses the exact source image.
 * This is the canonical representation. Never redesign.
 */
function OfficialLogo({ src, alt, className, sizes }: { src: string; alt: string; className?: string; sizes?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn('object-contain', className)}
      style={{ maxWidth: '100%', height: 'auto' }}
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
  const s = sizeMap[size];
  const w = width ?? s.w;
  const h = height ?? s.h;

  // Use the official image (3D rendered or flat)
  const logoSrc = threeD ? '/brand/blinkgo-3d.png' : '/brand/blinkgo-logo.png';
  const iconSrc = '/brand/blinkgo-icon.png';

  if (iconOnly || variant === 'mark') {
    return (
      <div className={cn('inline-flex items-center', className)} style={{ width: w, height: h }}>
        <OfficialLogo src={iconSrc} alt="BlinkGo" />
      </div>
    );
  }

  if (variant === 'wordmark') {
    // Just the BlinkGo text - this is rare, but we use the icon version
    return (
      <div className={cn('inline-flex flex-col items-center', className)}>
        <OfficialLogo src={iconSrc} alt="BlinkGo" />
        <span className="mt-1 text-[10px] font-bold tracking-widest text-text-muted uppercase">
          Schnell · Zuverlässig · Für Dich
        </span>
      </div>
    );
  }

  // full / horizontal — use the official combined logo image
  return (
    <div className={cn('inline-flex items-center', className)} style={{ width: w, height: h }}>
      <OfficialLogo src={logoSrc} alt="BlinkGo — Schnell. Zuverlässig. Für Dich." />
    </div>
  );
}
