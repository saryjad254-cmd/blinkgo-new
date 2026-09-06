/**
 * GlassCard — premium glassmorphism card with optional glow.
 *
 * Use for:
 *   - Hero sections
 *   - Promotional cards
 *   - Sticky headers
 *   - Floating panels
 */
'use client';

import { type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';

interface GlassCardProps {
  children: ReactNode;
  /** Visual intensity (default: 'medium') */
  intensity?: 'subtle' | 'medium' | 'strong';
  /** Accent color glow (default: 'none') */
  glow?: 'none' | 'brand' | 'success' | 'warning' | 'error';
  /** Border visibility */
  border?: boolean;
  /** Hover lift effect */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'article' | 'section' | 'aside';
}

const intensityMap = {
  subtle: 'bg-white/[0.02] backdrop-blur-sm',
  medium: 'bg-white/[0.04] backdrop-blur-md',
  strong: 'bg-white/[0.06] backdrop-blur-xl',
};

const glowMap = {
  none: '',
  brand: 'shadow-glow',
  success: 'shadow-glow-success',
  warning: 'shadow-glow-accent',
  error: 'shadow-glow',
};

export function GlassCard({
  children,
  intensity = 'medium',
  glow = 'none',
  border = true,
  interactive = false,
  className,
  style,
  as: Tag = 'div',
}: GlassCardProps) {
  return (
    <Tag
      className={cn(
        'relative rounded-2xl overflow-hidden',
        intensityMap[intensity],
        glowMap[glow],
        border && 'border border-white/[0.08]',
        interactive && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium-lg active:translate-y-0',
        className,
      )}
      style={style}
    >
      {children}
    </Tag>
  );
}

/**
 * GlassSurface — bottom-anchored frosted surface for mobile sheets
 */
export function GlassSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-bg/85 backdrop-blur-2xl border-t border-white/[0.08]',
        'shadow-[0_-8px_32px_rgba(0,0,0,0.4)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
