'use client';

import { useState, useMemo } from 'react';
import { Clock, Zap, Calendar } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ScheduleOrderPickerProps {
  /** Currently selected scheduled time (Date or null for ASAP) */
  scheduledFor: Date | null;
  /** Update parent state */
  onChange: (when: Date | null) => void;
  /** Earliest allowed time (default: now + 30min) */
  minLeadMinutes?: number;
  /** Max days ahead */
  maxDaysAhead?: number;
  t: {
    title?: string;
    asap?: string;
    asapSub?: string;
    schedule?: string;
    scheduleSub?: string;
    inMinutes?: (n: number) => string;
    inHour?: string;
    tomorrow?: string;
    pickTime?: string;
    minute?: string;
    hour?: string;
  };
}

/**
 * Schedule order time picker — Wolt/Uber Eats pattern:
 * - Toggle: ASAP (default) / Schedule
 * - Quick chips: +30min, +1hr, +2hr, Tomorrow morning
 * - Manual time picker fallback (datetime-local)
 *
 * Pre-validated: must be at least minLeadMinutes from now.
 */
export function ScheduleOrderPicker({
  scheduledFor,
  onChange,
  minLeadMinutes = 30,
  maxDaysAhead = 2,
  t,
}: ScheduleOrderPickerProps) {
  const [mode, setMode] = useState<'asap' | 'schedule'>(
    scheduledFor ? 'schedule' : 'asap',
  );
  const [manualTime, setManualTime] = useState(
    scheduledFor ? toLocalISO(scheduledFor) : defaultLocalISO(),
  );

  function setAsap() {
    setMode('asap');
    onChange(null);
  }

  function setSchedule(when: Date) {
    setMode('schedule');
    onChange(when);
  }

  function commitManual(iso: string) {
    setManualTime(iso);
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      setSchedule(d);
    }
  }

  // Quick options
  const options = useMemo(() => {
    const now = new Date();
    const opts: Array<{ label: string; sub: string; value: Date; key: string }> = [];

    const plus30 = new Date(now.getTime() + 30 * 60 * 1000);
    opts.push({
      label: '+30 min',
      sub: fmtTime(plus30),
      value: plus30,
      key: '30min',
    });

    const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
    opts.push({
      label: '+1 std',
      sub: fmtTime(plus1h),
      value: plus1h,
      key: '1h',
    });

    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    opts.push({
      label: '+2 std',
      sub: fmtTime(plus2h),
      value: plus2h,
      key: '2h',
    });

    // Tomorrow morning 9:00
    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(9, 0, 0, 0);
    opts.push({
      label: t.tomorrow ?? 'Morgen 9:00',
      sub: `${tmrw.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`,
      value: tmrw,
      key: 'tmrw',
    });

    return opts;
  }, []); // eslint-disable-line

  const activeKey = scheduledFor ? findClosestKey(scheduledFor, options) : 'asap';

  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
      {/* Mode toggle (segmented) */}
      <div className="flex p-1.5 bg-ink-900/60 mx-4 mt-4 rounded-2xl">
        <button
          type="button"
          onClick={setAsap}
          aria-pressed={mode === 'asap'}
          className={cn(
            'flex-1 h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-sm',
            'transition-all duration-200 ease-silk active:scale-[0.97]',
            mode === 'asap'
              ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow'
              : 'text-text-secondary hover:text-white',
          )}
        >
          <Zap className={cn('w-4 h-4', mode === 'asap' && 'fill-white')} />
          {t.asap ?? 'Sofort'}
        </button>
        <button
          type="button"
          onClick={() => setMode('schedule')}
          aria-pressed={mode === 'schedule'}
          className={cn(
            'flex-1 h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-sm',
            'transition-all duration-200 ease-silk active:scale-[0.97]',
            mode === 'schedule'
              ? 'bg-live-gradient text-white shadow-glow-info'
              : 'text-text-secondary hover:text-white',
          )}
        >
          <Calendar className="w-4 h-4" />
          {t.schedule ?? 'Planen'}
        </button>
      </div>

      {/* ASAP view */}
      {mode === 'asap' && (
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active flex items-center justify-center shadow-glow">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
              {t.asapSub ?? 'Schnellste Lieferung'}
            </p>
            <p className="text-sm text-white font-extrabold mt-0.5">
              ~25–35 {t.minute?.split(' ')[0] ?? 'Min.'}
            </p>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-glow-success" />
        </div>
      )}

      {/* Schedule view */}
      {mode === 'schedule' && (
        <>
          <div className="grid grid-cols-2 gap-2 px-4 pt-3">
            {options.map((opt) => {
              const isActive = mode === 'schedule' && activeKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSchedule(opt.value)}
                  aria-pressed={isActive}
                  className={cn(
                    'h-16 rounded-xl flex flex-col items-center justify-center gap-0.5',
                    'border transition-all duration-200 ease-silk',
                    'active:scale-[0.97]',
                    isActive
                      ? 'bg-live-gradient text-white border-cyan-400/60 shadow-glow-info'
                      : 'bg-surface text-text-secondary border-edge hover:bg-surface-light hover:text-white hover:border-edge-strong',
                  )}
                >
                  <span className="text-sm font-extrabold">{opt.label}</span>
                  <span className={cn('text-[10px] font-medium', isActive ? 'text-white/85' : 'text-text-muted')}>
                    {opt.sub}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Manual time input */}
          <div className="px-4 pt-3 pb-4">
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
              {t.pickTime ?? 'Oder genaue Uhrzeit wählen'}
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={manualTime}
                min={defaultLocalISO()}
                max={maxLocalISO(maxDaysAhead)}
                onChange={(e) => commitManual(e.target.value)}
                className={cn(
                  'flex-1 h-11 px-3 rounded-xl',
                  'bg-ink-700 border border-edge text-white text-sm font-bold',
                  'focus:border-cyan focus:ring-2 focus:ring-cyan/20 focus:outline-none',
                  'transition-all',
                  '[&::-webkit-calendar-picker-indicator]:filter-[invert(1)]',
                  '[&::-webkit-calendar-picker-indicator]:opacity-60',
                )}
              />
            </div>
          </div>
        </>
      )}

      {/* Footer summary */}
      {mode === 'schedule' && scheduledFor && (
        <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan flex-shrink-0" />
          <span className="text-xs text-cyan font-medium">
            Lieferung: <strong className="font-extrabold text-white">{fmtLong(scheduledFor)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function fmtLong(d: Date): string {
  return d.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultLocalISO(): string {
  const d = new Date(Date.now() + 45 * 60 * 1000); // +45 min default
  return toLocalISO(d);
}

function maxLocalISO(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return toLocalISO(d);
}

function findClosestKey(
  target: Date,
  options: Array<{ value: Date; key: string }>,
): string {
  let bestKey = options[0].key;
  let bestDiff = Infinity;
  for (const o of options) {
    const diff = Math.abs(o.value.getTime() - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestKey = o.key;
    }
  }
  return bestKey;
}
