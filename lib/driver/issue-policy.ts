export const DRIVER_ISSUE_CODES = [
  'restaurant_delay',
  'order_not_ready',
  'cannot_find_restaurant',
  'cannot_find_customer',
  'customer_unreachable',
  'damaged_order',
  'unsafe_situation',
] as const;

export type DriverIssueCode = (typeof DRIVER_ISSUE_CODES)[number];

// A ready order becomes `assigned` when a driver accepts it. It is still in
// the restaurant/pickup phase until the pickup transition succeeds, so the
// same restaurant-side issue reasons must remain available.
const PRE_PICKUP_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'assigned']);
const POST_PICKUP_STATUSES = new Set(['picked_up', 'delivering']);

export function isDriverIssueCode(value: unknown): value is DriverIssueCode {
  return typeof value === 'string' && DRIVER_ISSUE_CODES.includes(value as DriverIssueCode);
}

export function canReportDriverIssue(code: DriverIssueCode, status: string): boolean {
  if (code === 'unsafe_situation') return PRE_PICKUP_STATUSES.has(status) || POST_PICKUP_STATUSES.has(status);
  if (['restaurant_delay', 'order_not_ready', 'cannot_find_restaurant'].includes(code)) return PRE_PICKUP_STATUSES.has(status);
  return POST_PICKUP_STATUSES.has(status);
}

export function driverIssuePriority(code: DriverIssueCode): 'normal' | 'high' | 'urgent' {
  if (code === 'unsafe_situation') return 'urgent';
  if (['damaged_order', 'customer_unreachable'].includes(code)) return 'high';
  return 'normal';
}

export function shouldEscalateDriverIssue(code: DriverIssueCode): boolean {
  return driverIssuePriority(code) !== 'normal';
}

export function shouldNotifyCustomerAboutIssue(code: DriverIssueCode): boolean {
  return ['restaurant_delay', 'order_not_ready', 'customer_unreachable', 'unsafe_situation'].includes(code);
}
