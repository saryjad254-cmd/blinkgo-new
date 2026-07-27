// Re-export from the new design system with extra props
import { EmptyState as _EmptyState } from '@/components/shared/EmptyState';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({ size = 'md', className, ...rest }: Props) {
  const sizeClass = size === 'sm' ? 'py-6' : size === 'lg' ? 'py-20' : 'py-12';
  return <_EmptyState {...rest} className={`${sizeClass} ${className ?? ''}`} />;
}
