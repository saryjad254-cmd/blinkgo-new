'use client';

import { BlinkLogo } from './BlinkLogo';

export type BlinkGoLogoVariant = 'full' | 'wordmark' | 'b';
export type BlinkGoLogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface BlinkGoLogoProps {
  variant: BlinkGoLogoVariant;
  size?: BlinkGoLogoSize;
  className?: string;
  priority?: boolean;
  invert?: boolean;
}

/** Compatibility wrapper around the single canonical BlinkGo logo. */
export function BlinkGoLogo({ variant, size = 'md', className, priority }: BlinkGoLogoProps) {
  return (
    <BlinkLogo
      variant={variant === 'b' ? 'mark' : variant}
      size={size}
      className={className}
      priority={priority}
    />
  );
}

export function BlinkGoBIcon({ size = 32, className }: { size?: number; className?: string }) {
  return <BlinkLogo variant="mark" size="sm" width={size} height={size} className={className} />;
}
