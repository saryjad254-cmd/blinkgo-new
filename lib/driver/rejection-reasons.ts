export const DRIVER_RELEASE_REASONS = [
  'restaurant_delay',
  'vehicle_issue',
  'unsafe_route',
  'too_far',
  'personal_emergency',
  'other',
] as const;

export type DriverReleaseReason = typeof DRIVER_RELEASE_REASONS[number];

export function isDriverReleaseReason(value: unknown): value is DriverReleaseReason {
  return typeof value === 'string' && DRIVER_RELEASE_REASONS.includes(value as DriverReleaseReason);
}

export function normalizeDriverReleaseInput(input: unknown): { reason: DriverReleaseReason; details: string } | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  if (isDriverReleaseReason(body.reason_code)) {
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 200) : '';
    if (body.reason_code === 'other' && details.length < 3) return null;
    return { reason: body.reason_code, details };
  }
  // Backward compatibility for older installed clients. Their free-text reason
  // is preserved as details and classified as `other`.
  if (typeof body.reason === 'string' && body.reason.trim()) {
    return { reason: 'other', details: body.reason.trim().slice(0, 200) };
  }
  return null;
}
