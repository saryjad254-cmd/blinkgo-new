export const DRIVER_TIME_ZONE = 'Europe/Berlin';

export interface DriverWorkingHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
}

const BERLIN_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: DRIVER_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseDriverTimeMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
}

export function normalizeDriverWorkingHours(value: unknown): DriverWorkingHour[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const normalized = value.map((row: unknown) => {
    const source = row && typeof row === 'object' && !Array.isArray(row)
      ? row as Record<string, unknown>
      : {};
    return {
      day_of_week: Number(source.day_of_week),
      start_time: String(source.start_time ?? ''),
      end_time: String(source.end_time ?? ''),
      is_enabled: source.is_enabled === true,
    };
  });
  const uniqueDays = new Set(normalized.map((row) => row.day_of_week));
  const valid = uniqueDays.size === 7 && normalized.every((row) =>
    Number.isInteger(row.day_of_week)
    && row.day_of_week >= 0
    && row.day_of_week <= 6
    && parseDriverTimeMinutes(row.start_time) != null
    && parseDriverTimeMinutes(row.end_time) != null);
  return valid ? normalized : null;
}

function berlinSchedulePoint(now: Date): { day: number; minutes: number } {
  const parts = BERLIN_CLOCK.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: WEEKDAY_INDEX[values.weekday] ?? 0,
    minutes: Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0),
  };
}

function windowMinutes(row: DriverWorkingHour | undefined): { start: number; end: number } | null {
  if (!row?.is_enabled) return null;
  const start = parseDriverTimeMinutes(row.start_time);
  const end = parseDriverTimeMinutes(row.end_time);
  return start == null || end == null ? null : { start, end };
}

export function isDriverWithinWorkingHours(
  hours: readonly DriverWorkingHour[],
  now = new Date(),
): boolean {
  if (hours.length !== 7) return false;
  const { day, minutes } = berlinSchedulePoint(now);
  const today = windowMinutes(hours.find((row) => row.day_of_week === day));
  if (today) {
    if (today.start === today.end) return true;
    if (today.start < today.end && minutes >= today.start && minutes < today.end) return true;
    if (today.start > today.end && minutes >= today.start) return true;
  }

  const previousDay = (day + 6) % 7;
  const previous = windowMinutes(hours.find((row) => row.day_of_week === previousDay));
  return Boolean(previous && previous.start > previous.end && minutes < previous.end);
}
