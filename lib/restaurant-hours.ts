export const RESTAURANT_TIME_ZONE = 'Europe/Berlin';

export const SHORT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const LONG_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export type ShortDay = (typeof SHORT_DAYS)[number];
export type LongDay = (typeof LONG_DAYS)[number];
export type RestaurantHours = Partial<Record<ShortDay, { open: string; close: string }>>;
export type RestaurantHourRow = { day: LongDay; is_open: boolean; open_time: string; close_time: string };
export type RestaurantSpecialHour = {
  id?: string;
  service_date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason?: string | null;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_ALIASES = Object.fromEntries(LONG_DAYS.map((day, index) => [day, SHORT_DAYS[index]])) as Record<LongDay, ShortDay>;

export const DEFAULT_RESTAURANT_HOURS: RestaurantHours = {
  mon: { open: '09:00', close: '22:00' }, tue: { open: '09:00', close: '22:00' },
  wed: { open: '09:00', close: '22:00' }, thu: { open: '09:00', close: '22:00' },
  fri: { open: '09:00', close: '23:00' }, sat: { open: '10:00', close: '23:00' },
  sun: { open: '10:00', close: '22:00' },
};

export function isValidRestaurantTime(value: unknown): value is string { return typeof value === 'string' && TIME_PATTERN.test(value); }

function readSlot(value: unknown): { open: string; close: string } | null {
  if (Array.isArray(value) && value.length === 2 && isValidRestaurantTime(value[0]) && isValidRestaurantTime(value[1])) return { open: value[0], close: value[1] };
  if (!value || typeof value !== 'object') return null;
  const slot = value as { open?: unknown; close?: unknown; open_time?: unknown; close_time?: unknown; is_open?: unknown };
  if (slot.is_open === false) return null;
  const open = slot.open ?? slot.open_time; const close = slot.close ?? slot.close_time;
  return isValidRestaurantTime(open) && isValidRestaurantTime(close) ? { open, close } : null;
}

export function normalizeRestaurantHours(input: unknown): RestaurantHours {
  const schedule: RestaurantHours = {};
  if (Array.isArray(input)) {
    for (const value of input) {
      if (!value || typeof value !== 'object') continue;
      const row = value as { day?: unknown; is_open?: unknown };
      if (typeof row.day !== 'string' || row.is_open === false) continue;
      const short = (SHORT_DAYS.includes(row.day as ShortDay) ? row.day : DAY_ALIASES[row.day as LongDay]) as ShortDay | undefined;
      const slot = readSlot(value); if (short && slot) schedule[short] = slot;
    }
    return schedule;
  }
  if (!input || typeof input !== 'object') return schedule;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const short = (SHORT_DAYS.includes(key as ShortDay) ? key : DAY_ALIASES[key as LongDay]) as ShortDay | undefined;
    const slot = readSlot(value); if (short && slot) schedule[short] = slot;
  }
  return schedule;
}

export function restaurantHoursToRows(input: unknown): RestaurantHourRow[] {
  const schedule = normalizeRestaurantHours(input);
  return LONG_DAYS.map((day, index) => ({ day, is_open: Boolean(schedule[SHORT_DAYS[index]]), open_time: schedule[SHORT_DAYS[index]]?.open ?? DEFAULT_RESTAURANT_HOURS[SHORT_DAYS[index]]?.open ?? '09:00', close_time: schedule[SHORT_DAYS[index]]?.close ?? DEFAULT_RESTAURANT_HOURS[SHORT_DAYS[index]]?.close ?? '22:00' }));
}

export function rowsToRestaurantHours(rows: RestaurantHourRow[]): RestaurantHours {
  const schedule: RestaurantHours = {};
  rows.forEach((row, index) => { if (row.is_open && isValidRestaurantTime(row.open_time) && isValidRestaurantTime(row.close_time)) schedule[SHORT_DAYS[index]] = { open: row.open_time, close: row.close_time }; });
  return schedule;
}

function minutes(value: string) { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; }

function localDateAndTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function previousDateKey(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

/** A date-specific row overrides the weekly schedule, including overnight carry-over. */
export function isRestaurantOpenAt(
  input: unknown,
  now = new Date(),
  specialHours: RestaurantSpecialHour[] = [],
  timeZone = RESTAURANT_TIME_ZONE,
): boolean {
  const local = localDateAndTime(now, timeZone);
  const today = specialHours.find((row) => row.service_date === local.date);
  if (today) {
    if (today.is_closed || !isValidRestaurantTime(today.open_time) || !isValidRestaurantTime(today.close_time)) return false;
    const open = minutes(today.open_time); const close = minutes(today.close_time);
    if (open < close) return local.minutes >= open && local.minutes < close;
    if (local.minutes >= open) return true;
  }
  const previous = specialHours.find((row) => row.service_date === previousDateKey(local.date));
  if (previous && !previous.is_closed && isValidRestaurantTime(previous.open_time) && isValidRestaurantTime(previous.close_time)) {
    const open = minutes(previous.open_time); const close = minutes(previous.close_time);
    if (open >= close && local.minutes < close) return true;
  }
  if (today) return false;
  return isRestaurantOpenNow(input, now, timeZone);
}

export function isRestaurantOpenNow(input: unknown, now = new Date(), timeZone = RESTAURANT_TIME_ZONE): boolean {
  if (input == null) return true;
  const schedule = normalizeRestaurantHours(input);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value.toLowerCase().slice(0, 3) as ShortDay;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0); const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const nowMinutes = hour * 60 + minute; const todayIndex = SHORT_DAYS.indexOf(weekday);
  if (todayIndex < 0) return false;
  const today = schedule[weekday];
  if (today) {
    const open = minutes(today.open); const close = minutes(today.close);
    if (open < close && nowMinutes >= open && nowMinutes < close) return true;
    if (open >= close && nowMinutes >= open) return true;
  }
  const previous = schedule[SHORT_DAYS[(todayIndex + 6) % 7]];
  if (previous) {
    const open = minutes(previous.open); const close = minutes(previous.close);
    if (open >= close && nowMinutes < close) return true;
  }
  return false;
}
