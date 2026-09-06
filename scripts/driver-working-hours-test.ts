import {
  isDriverWithinWorkingHours,
  normalizeDriverWorkingHours,
  type DriverWorkingHour,
} from '../lib/driver/working-hours';

let passed = 0;
function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const closedWeek: DriverWorkingHour[] = Array.from({ length: 7 }, (_, day) => ({
  day_of_week: day,
  start_time: '09:00',
  end_time: '17:00',
  is_enabled: false,
}));
const mondayDay = closedWeek.map((row) => row.day_of_week === 1
  ? { ...row, is_enabled: true }
  : row);
const mondayNight = closedWeek.map((row) => row.day_of_week === 1
  ? { ...row, start_time: '22:00', end_time: '02:00', is_enabled: true }
  : row);

check(isDriverWithinWorkingHours(mondayDay, new Date('2026-08-10T08:00:00Z')), 'Berlin summer time opens Monday at 10:00 local');
check(!isDriverWithinWorkingHours(mondayDay, new Date('2026-08-10T15:00:00Z')), 'Closing boundary at 17:00 local is offline');
check(isDriverWithinWorkingHours(mondayNight, new Date('2026-08-10T21:00:00Z')), 'Overnight shift is active on its start day');
check(isDriverWithinWorkingHours(mondayNight, new Date('2026-08-10T23:30:00Z')), 'Overnight shift carries into Tuesday in Berlin');
check(!isDriverWithinWorkingHours(mondayNight, new Date('2026-08-11T00:00:00Z')), 'Overnight shift closes exactly at 02:00 local');
check(!isDriverWithinWorkingHours(closedWeek, new Date('2026-08-10T10:00:00Z')), 'Disabled day stays offline');
check(normalizeDriverWorkingHours(mondayDay)?.length === 7, 'Complete seven-day schedule is accepted');
check(normalizeDriverWorkingHours(mondayDay.slice(0, 6)) === null, 'Incomplete schedule fails closed');
check(normalizeDriverWorkingHours(mondayDay.map((row, index) => index === 0 ? { ...row, start_time: '25:00' } : row)) === null, 'Invalid time fails closed');

console.log(`Driver working hours: PASS (${passed}/${passed})`);
