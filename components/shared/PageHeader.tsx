'use client';

import type { ReactNode } from 'react';
import { BackButton } from './BackButton';
import { BlinkButton } from '@/components/brand/BlinkButton';
import { cn } from '@/lib/cn';

interface Props {
  title: string;
  subtitle?: string;
  back?: boolean;
  backHref?: string;
  right?: ReactNode;
  action?: ReactNode;
  sticky?: boolean;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  back,
  backHref,
  right,
  action,
  sticky = true,
  children,
  className = '',
}: Props) {
  return (
    <header
      className={cn(
        'z-sticky bg-bg/85 backdrop-blur-2xl border-b border-edge',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 min-h-[56px]">
        {back && <BackButton fallback={backHref} />}
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-extrabold text-text-primary truncate leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-text-secondary truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
        {action}
        {children}
      </div>
    </header>
  );
}
