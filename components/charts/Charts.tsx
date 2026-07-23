'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';

/**
 * Charts — lightweight, dependency-free SVG charts.
 * Designed for premium dashboards (no chart library needed).
 * All charts are responsive, RTL-aware, and theme-aware.
 */

export interface BarSeries {
  label: string;
  value: number;
  color?: string;
  metadata?: any;
}

// ─────────────────────────────────────────────────────────────
// BarChart — vertical bars with optional stacked layers
// ─────────────────────────────────────────────────────────────

interface BarChartProps {
  data: BarSeries[];
  /** Chart height in pixels (default 180) */
  height?: number;
  /** Show value labels on top of bars (default true) */
  showValues?: boolean;
  /** Locale for value formatting */
  locale?: string;
  /** Custom value formatter */
  formatValue?: (v: number) => string;
  /** Accent color (defaults to brand-500) */
  accent?: string;
  /** Show X-axis labels (default true) */
  showAxis?: boolean;
  className?: string;
}

export function BarChart({
  data,
  height = 180,
  showValues = true,
  locale = 'de-DE',
  formatValue,
  accent = 'bg-brand-red-500',
  showAxis = true,
  className,
}: BarChartProps) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const fmt = useMemo(
    () => formatValue ?? ((v: number) => v.toLocaleString(locale, { maximumFractionDigits: 0 })),
    [formatValue, locale],
  );

  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-text-muted text-sm">—</div>;
  }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <div className="flex h-full items-end gap-1.5">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 group relative">
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1 px-2 py-1 rounded-lg bg-ink-700 border border-edge text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {fmt(d.value)}
                <div className="text-[9px] text-text-muted font-normal mt-0.5">{d.label}</div>
              </div>
              {/* Value label */}
              {showValues && d.value > 0 && (
                <span className="text-[9px] font-extrabold text-text-secondary mb-1 tabular-nums">
                  {fmt(d.value)}
                </span>
              )}
              {/* Bar */}
              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-500 ease-silk',
                  'group-hover:opacity-90',
                  d.color ?? accent,
                )}
                style={{ height: `${pct}%`, minHeight: d.value > 0 ? '4px' : '0' }}
              />
            </div>
          );
        })}
      </div>
      {showAxis && (
        <div className="flex gap-1.5 mt-1.5">
          {data.map((d, i) => (
            <div key={i} className="flex-1 text-center min-w-0">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider truncate block">
                {d.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LineChart — points + connecting line (with optional fill)
// ─────────────────────────────────────────────────────────────

interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LinePoint[];
  height?: number;
  showValues?: boolean;
  showDots?: boolean;
  locale?: string;
  formatValue?: (v: number) => string;
  accent?: string;
  fill?: boolean;
  className?: string;
}

export function LineChart({
  data,
  height = 180,
  showValues = false,
  showDots = true,
  locale = 'de-DE',
  formatValue,
  accent = '#EF4444',
  fill = true,
  className,
}: LineChartProps) {
  const fmt = useMemo(
    () => formatValue ?? ((v: number) => v.toLocaleString(locale, { maximumFractionDigits: 0 })),
    [formatValue, locale],
  );

  const { path, area, max, points, gridLines } = useMemo(() => {
    if (data.length === 0) return { path: '', area: '', max: 0, points: [], gridLines: [] };
    const max = Math.max(1, ...data.map((d) => d.value));
    const min = Math.min(0, ...data.map((d) => d.value));
    const w = 100; // viewBox width %
    const h = 100; // viewBox height %
    const padding = 5;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const points = data.map((d, i) => {
      const x = padding + i * stepX;
      const y = h - padding - ((d.value - min) / (max - min || 1)) * innerH;
      return { x, y, value: d.value, label: d.label };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const first = points[0];
    const last = points[points.length - 1];
    const area = `${path} L ${last.x},${h - padding} L ${first.x},${h - padding} Z`;
    const gridLines = [0.25, 0.5, 0.75].map((p) => h - padding - innerH * p);
    return { path, area, max, points, gridLines };
  }, [data]);

  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-text-muted text-sm">—</div>;
  }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((y, i) => (
          <line
            key={i}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.3"
            strokeDasharray="2,2"
          />
        ))}

        {/* Fill area */}
        {fill && <path d={area} fill="url(#line-fill)" />}

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Dots */}
        {showDots &&
          points.map((p, i) => (
            <g key={i} className="group">
              <circle
                cx={p.x}
                cy={p.y}
                r="1.4"
                fill={accent}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
                className="transition-all"
              />
              {/* Hover dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r="3"
                fill={accent}
                opacity="0"
                className="group-hover:opacity-30 transition-opacity"
                vectorEffect="non-scaling-stroke"
              />
              {/* Tooltip */}
              <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <rect
                  x={p.x - 12}
                  y={p.y - 14}
                  width="24"
                  height="9"
                  rx="1.5"
                  fill="rgba(0,0,0,0.85)"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="0.2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={p.x}
                  y={p.y - 8.5}
                  textAnchor="middle"
                  fontSize="4"
                  fontWeight="700"
                  fill="#fff"
                  style={{ fontFamily: 'system-ui' }}
                >
                  {fmt(p.value)}
                </text>
              </g>
            </g>
          ))}
      </svg>

      {showValues && (
        <div className="flex justify-between mt-2 px-1">
          {data.map((d, i) => (
            <span key={i} className="text-[9px] font-extrabold text-text-secondary tabular-nums">
              {fmt(d.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ProgressBar — gradient progress (for daily/weekly goal)
// ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number;
  max: number;
  height?: number;
  showLabel?: boolean;
  label?: string;
  formatValue?: (v: number) => string;
  accent?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max,
  height = 12,
  showLabel = true,
  label,
  formatValue,
  accent = 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active',
  className,
  locale = 'de',
}: ProgressBarProps & { locale?: string }) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  const fmt = formatValue ?? ((v: number) => v.toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE'));
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-text-secondary font-bold">{label}</span>
          <span className="text-text font-extrabold tabular-nums">
            {fmt(value)} <span className="text-text-muted">/ {fmt(max)}</span>
          </span>
        </div>
      )}
      <div
        className="w-full rounded-full bg-surface overflow-hidden border border-edge"
        style={{ height }}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-silk', accent)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SparkLine — minimal line for stat cards
// ─────────────────────────────────────────────────────────────

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  accent?: string;
  className?: string;
}

export function SparkLine({ data, width = 80, height = 28, accent = '#EF4444', className }: SparkLineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / Math.max(1, max - min)) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
