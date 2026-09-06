import Image from 'next/image';
import { cn } from '@/lib/cn';
import { OFFICIAL_BLINKGO_LOGO_SRC } from './brand-assets';

interface BlinkLogoProps {
  variant?: 'full' | 'horizontal' | 'mark' | 'wordmark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'hero';
  className?: string;
  width?: number;
  height?: number;
  threeD?: boolean;
  iconOnly?: boolean;
  priority?: boolean;
}

const officialLogoSizeMap = {
  xs: 'h-7', sm: 'h-9', md: 'h-11', lg: 'h-14', xl: 'h-20',
  '2xl': 'h-24', '3xl': 'h-28', hero: 'h-36',
};

/**
 * Canonical BlinkGo logo renderer. Every compatibility variant resolves to
 * the same approved asset; width stays automatic so the logo is never
 * stretched, recolored or redrawn by a page.
 */
export function BlinkLogo({
  variant = 'horizontal',
  size = 'md',
  className,
  threeD = false,
  iconOnly = false,
  priority = false,
}: BlinkLogoProps) {
  return (
    <Image
      src={OFFICIAL_BLINKGO_LOGO_SRC}
      alt="BlinkGo"
      width={270}
      height={92}
      priority={priority}
      sizes="(max-width: 640px) 55vw, 270px"
      style={{ width: 'auto' }}
      data-logo-variant={variant}
      data-logo-compat={threeD || iconOnly ? 'legacy-prop' : undefined}
      className={cn(
        'w-auto shrink-0 select-none object-contain',
        officialLogoSizeMap[size],
        className,
      )}
    />
  );
}
