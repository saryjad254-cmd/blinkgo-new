// Re-export from the new design system
import { BlinkCard as _BlinkCard, BlinkCardHeader, BlinkCardTitle, BlinkCardDescription, BlinkCardContent, BlinkCardFooter } from '@/components/brand/BlinkCard';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardProps = ComponentProps<typeof _BlinkCard> & {
  hover?: boolean;
  press?: boolean;
  children?: ReactNode;
};

export function Card({ hover, press, ...rest }: CardProps) {
  return <_BlinkCard hoverable={hover} className={press ? cn('active:scale-[0.98]', rest.className) : rest.className} {...rest} />;
}

export const CardHeader = BlinkCardHeader;
export const CardTitle = BlinkCardTitle;
export const CardDescription = BlinkCardDescription;
export const CardContent = BlinkCardContent;
export const CardFooter = BlinkCardFooter;

// StatCard - a brand-aligned stat card for dashboard use
export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  change?: number;
  prefix?: string;
  suffix?: string;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'brand';
  accent?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
  trend?: { value: string; up: boolean };
}

const colorMap = {
  default: 'bg-surface-light text-text-secondary',
  primary: 'bg-brand-red/15 text-brand-red',
  success: 'bg-emerald-500/15 text-emerald-500',
  warning: 'bg-brand-yellow-500/15 text-brand-yellow-500',
  danger: 'bg-brand-red/15 text-brand-red',
  info: 'bg-blue-500/15 text-blue-500',
  brand: 'bg-brand-yellow/20 text-brand-yellow-hover',
  purple: 'bg-purple-500/15 text-purple-500',
};

export function StatCard({ label, value, icon, change, prefix, suffix, color, accent, trend }: StatCardProps) {
  const c = (color ?? accent ?? 'default') as keyof typeof colorMap;
  return (
    <_BlinkCard variant="default" padding="md" hoverable>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">{label}</span>
        {icon && <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', colorMap[c])}>{icon}</div>}
      </div>
      <div className="flex items-baseline gap-1">
        {prefix && <span className="text-lg font-extrabold text-text-secondary">{prefix}</span>}
        <span className="text-2xl sm:text-3xl font-black text-text-primary">{value}</span>
        {suffix && <span className="text-sm font-bold text-text-secondary">{suffix}</span>}
      </div>
      {change !== undefined && (
        <div className={cn('text-xs font-bold mt-1', change >= 0 ? 'text-emerald-500' : 'text-brand-red')}>
          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
        </div>
      )}
      {trend && (
        <div className={cn('text-xs font-bold mt-1', trend.up ? 'text-emerald-500' : 'text-brand-red')}>
          {trend.value}
        </div>
      )}
    </_BlinkCard>
  );
}
