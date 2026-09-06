'use client';

/**
 * Premium Badge — single source of truth.
 *
 * Tones: brand, success, warning, error, info, violet, neutral
 * Variants: solid, subtle, outline
 * Sizes: sm, md
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'violet' | 'neutral';
type Variant = 'solid' | 'subtle' | 'outline';
type Size = 'sm' | 'md';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
}

const toneClasses: Record<Tone, Record<Variant, string>> = {
  brand: {
    solid:   'bg-red-500 text-white',
    subtle:  'bg-red-500/15 text-red-300 border border-red-500/20',
    outline: 'border border-red-500/40 text-red-300',
  },
  success: {
    solid:   'bg-emerald-500 text-white',
    subtle:  'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    outline: 'border border-emerald-500/40 text-emerald-300',
  },
  warning: {
    solid:   'bg-amber-500 text-white',
    subtle:  'bg-amber-500/15 text-amber-300 border border-amber-500/20',
    outline: 'border border-amber-500/40 text-amber-300',
  },
  error: {
    solid:   'bg-red-500 text-white',
    subtle:  'bg-red-500/15 text-red-300 border border-red-500/20',
    outline: 'border border-red-500/40 text-red-300',
  },
  info: {
    solid:   'bg-cyan-500 text-white',
    subtle:  'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20',
    outline: 'border border-cyan-500/40 text-cyan-300',
  },
  violet: {
    solid:   'bg-violet-500 text-white',
    subtle:  'bg-violet-500/15 text-violet-300 border border-violet-500/20',
    outline: 'border border-violet-500/40 text-violet-300',
  },
  neutral: {
    solid:   'bg-white/10 text-white',
    subtle:  'bg-white/[0.06] text-text-secondary border border-white/[0.08]',
    outline: 'border border-white/[0.16] text-text-secondary',
  },
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-5 px-1.5 text-[10px] gap-0.5',
  md: 'h-6 px-2 text-xs gap-1',
};

export function Badge({
  children,
  tone = 'brand',
  variant = 'subtle',
  size = 'md',
  icon,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-full',
        'whitespace-nowrap',
        toneClasses[tone][variant],
        sizeClasses[size],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
