/**
 * Portal Primitives — shared building blocks
 * ────────────────────────────────────────────
 * Cards, stats, empty states, status badges, KPI tiles.
 * Designed to look like Uber Eats / Wolt / DoorDash.
 */
'use client';

import { cn } from '@/lib/cn';
import TrendingUp from 'lucide-react/dist/esm/icons/trending-up';
import TrendingDown from 'lucide-react/dist/esm/icons/trending-down';

// ──────────────── Page header ────────────────

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span>/</span>}
              {b.href ? <a href={b.href} className="hover:text-text-primary">{b.label}</a> : <span>{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// ──────────────── KPI tile ────────────────

export interface KpiTileProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number; // percentage change
  deltaLabel?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function KpiTile({ label, value, hint, delta, deltaLabel, icon, tone = 'default' }: KpiTileProps) {
  const toneStyles: Record<string, string> = {
    default: 'bg-surface border-border',
    success: 'bg-status-success/5 border-status-success/20',
    warning: 'bg-status-warning/5 border-status-warning/20',
    danger: 'bg-status-error/5 border-status-error/20',
    info: 'bg-status-info/5 border-status-info/20',
  };
  return (
    <div className={cn('p-4 rounded-2xl border', toneStyles[tone])}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</p>
        {icon && <div className="w-10 h-10 rounded-xl bg-bg/80 flex items-center justify-center text-text-secondary">{icon}</div>}
      </div>
      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold',
              delta >= 0 ? 'text-status-success' : 'text-status-error',
            )}
          >
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
        {(hint || deltaLabel) && (
          <span className="text-text-muted truncate">{deltaLabel || hint}</span>
        )}
      </div>
    </div>
  );
}

// ──────────────── Card ────────────────

export function PortalCard({
  children,
  className,
  padding = 'md',
}: {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}) {
  const pad = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-6' }[padding];
  return (
    <div className={cn('bg-surface border border-border rounded-2xl', pad, className)}>
      {children}
    </div>
  );
}

// ──────────────── Section ────────────────

export function SectionTitle({ children, hint, action }: { children: React.ReactNode; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{children}</h2>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// ──────────────── Empty state ────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-bg flex items-center justify-center text-text-muted mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold mb-1">{title}</h3>
      {description && <p className="text-sm text-text-muted max-w-md mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ──────────────── Status pill ────────────────

const STATUS_STYLES: Record<string, string> = {
  // Order lifecycle
  pending: 'bg-status-warning/10 text-status-warning',
  confirmed: 'bg-status-info/10 text-status-info',
  preparing: 'bg-status-info/10 text-status-info',
  ready: 'bg-status-info/10 text-status-info',
  picked_up: 'bg-brand-red/10 text-brand-red',
  delivered: 'bg-status-success/10 text-status-success',
  cancelled: 'bg-status-error/10 text-status-error',
  failed: 'bg-status-error/10 text-status-error',
  // Driver availability
  online: 'bg-status-success/10 text-status-success',
  offline: 'bg-text-muted/10 text-text-muted',
  busy: 'bg-status-warning/10 text-status-warning',
  paused: 'bg-status-warning/10 text-status-warning',
  // Generic
  active: 'bg-status-success/10 text-status-success',
  inactive: 'bg-text-muted/10 text-text-muted',
  banned: 'bg-status-error/10 text-status-error',
  pending_review: 'bg-status-warning/10 text-status-warning',
  approved: 'bg-status-success/10 text-status-success',
  rejected: 'bg-status-error/10 text-status-error',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] || 'bg-bg text-text-secondary';
  const text = label || status.replace(/_/g, ' ');
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize whitespace-nowrap', style)}>
      {text}
    </span>
  );
}

// ──────────────── Skeleton ────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-bg rounded', className)} />;
}

// ──────────────── Avatar ────────────────

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base' };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn('rounded-full object-cover', sizeMap[size])} />;
  }
  return (
    <div className={cn('rounded-full bg-gradient-to-br from-brand-red to-brand-yellow flex items-center justify-center text-white font-bold', sizeMap[size])}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ──────────────── Bar list ────────────────

export function BarList<T>({
  items,
  valueKey,
  labelKey,
  max,
  formatValue,
}: {
  items: T[];
  valueKey: keyof T;
  labelKey: keyof T;
  max?: number;
  formatValue?: (v: number) => string;
}) {
  const maxVal = max ?? Math.max(...items.map((i) => Number(i[valueKey])), 1);
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const value = Number(item[valueKey]);
        const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
        return (
          <div key={idx}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="truncate">{String(item[labelKey])}</span>
              <span className="font-semibold ml-2">{formatValue ? formatValue(value) : value}</span>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-red to-brand-yellow rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
