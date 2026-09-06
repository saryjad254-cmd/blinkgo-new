export type DeliverySurgeRule = {
  delivery_fee?: number | string | null;
  surge_multiplier?: number | string | null;
  surge_days?: unknown;
  surge_start_local?: string | null;
  surge_end_local?: string | null;
  surge_timezone?: string | null;
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function timeMinutes(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
}

function zonedClock(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const weekday = WEEKDAY_INDEX[get('weekday') ?? ''];
    const hour = Number(get('hour')); const minute = Number(get('minute'));
    return Number.isInteger(weekday) && Number.isFinite(hour) && Number.isFinite(minute) ? { weekday, minutes: hour * 60 + minute } : null;
  } catch { return null; }
}

function surgeDays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
}

export function normalizeSurgePolicy(input: Record<string, unknown>) {
  const rawMultiplier = Number(input.surge_multiplier ?? 1);
  if (!Number.isFinite(rawMultiplier) || rawMultiplier < 1 || rawMultiplier > 2) return null;
  const multiplier = Math.round(rawMultiplier * 100) / 100;
  const days = surgeDays(input.surge_days);
  const start = typeof input.surge_start_local === 'string' && timeMinutes(input.surge_start_local) !== null ? input.surge_start_local.slice(0, 5) : null;
  const end = typeof input.surge_end_local === 'string' && timeMinutes(input.surge_end_local) !== null ? input.surge_end_local.slice(0, 5) : null;
  const timeZone = typeof input.surge_timezone === 'string' ? input.surge_timezone : 'Europe/Berlin';
  if (timeZone !== 'Europe/Berlin') return null;
  if (multiplier > 1 && (!days.length || start === null || end === null || start === end)) return null;
  return {
    surge_multiplier: multiplier,
    surge_days: multiplier > 1 ? days.sort((a, b) => a - b) : [],
    surge_start_local: multiplier > 1 ? start : null,
    surge_end_local: multiplier > 1 ? end : null,
    surge_timezone: timeZone,
  };
}

export function deliveryZonePricing(rule: DeliverySurgeRule, now = new Date()) {
  const baseFee = Math.max(0, Number(rule.delivery_fee ?? 0));
  const configuredMultiplier = Number(rule.surge_multiplier ?? 1);
  const multiplier = Number.isFinite(configuredMultiplier) && configuredMultiplier >= 1 && configuredMultiplier <= 2 ? configuredMultiplier : 1;
  const days = surgeDays(rule.surge_days);
  const start = timeMinutes(rule.surge_start_local);
  const end = timeMinutes(rule.surge_end_local);
  const clock = zonedClock(now, rule.surge_timezone || 'Europe/Berlin');
  let surgeActive = false;
  if (multiplier > 1 && days.length && start !== null && end !== null && start !== end && clock) {
    surgeActive = start < end
      ? days.includes(clock.weekday) && clock.minutes >= start && clock.minutes < end
      : (days.includes(clock.weekday) && clock.minutes >= start) || (days.includes((clock.weekday + 6) % 7) && clock.minutes < end);
  }
  const effectiveMultiplier = surgeActive ? multiplier : 1;
  const baseFeeCents = Math.round(baseFee * 100);
  const deliveryFee = Math.round(baseFeeCents * effectiveMultiplier) / 100;
  return {
    baseFee: baseFeeCents / 100,
    multiplier: effectiveMultiplier,
    surgeActive,
    surgeAmount: Math.round((deliveryFee - baseFeeCents / 100) * 100) / 100,
    deliveryFee,
    timeZone: rule.surge_timezone || 'Europe/Berlin',
  };
}
