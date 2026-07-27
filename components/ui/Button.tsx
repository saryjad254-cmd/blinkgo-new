// Re-export from the new design system
import { BlinkButton as _BlinkButton } from '@/components/brand/BlinkButton';
import type { ComponentProps, ReactNode } from 'react';

type ButtonProps = Omit<ComponentProps<typeof _BlinkButton>, 'variant'> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'outlined' | 'ghost' | 'danger' | 'success' | 'glass' | 'accent' | 'premium' | 'live' | 'tip' | 'gold' | 'love';
  children?: ReactNode;
};

export function Button({ variant, ...rest }: ButtonProps) {
  // Map 'outline' to 'outlined'
  const v = (variant === 'outline' ? 'outlined' : variant) as ComponentProps<typeof _BlinkButton>['variant'];
  return <_BlinkButton variant={v} {...rest} />;
}
