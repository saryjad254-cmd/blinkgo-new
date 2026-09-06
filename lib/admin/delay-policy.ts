export interface DelayReviewPolicy {
  enabled: boolean;
  reviewAfterMinutes: number;
  criticalAfterMinutes: number;
  baseCreditCents: number;
  perExtraMinuteCents: number;
  maxCreditCents: number;
}

export const DEFAULT_DELAY_REVIEW_POLICY: DelayReviewPolicy = {
  enabled: true,
  reviewAfterMinutes: 20,
  criticalAfterMinutes: 35,
  baseCreditCents: 150,
  perExtraMinuteCents: 25,
  maxCreditCents: 500,
};

export function normalizeDelayReviewPolicy(value: unknown): DelayReviewPolicy {
  let input: Record<string, unknown> = {};
  if (typeof value === 'string') {
    try { input = JSON.parse(value) as Record<string, unknown>; } catch { input = {}; }
  } else if (value && typeof value === 'object') input = value as Record<string, unknown>;
  const reviewAfterMinutes = boundedInteger(input.reviewAfterMinutes, DEFAULT_DELAY_REVIEW_POLICY.reviewAfterMinutes, 5, 120);
  const criticalAfterMinutes = boundedInteger(input.criticalAfterMinutes, DEFAULT_DELAY_REVIEW_POLICY.criticalAfterMinutes, reviewAfterMinutes + 5, 240);
  const baseCreditCents = boundedInteger(input.baseCreditCents, DEFAULT_DELAY_REVIEW_POLICY.baseCreditCents, 0, 10_000);
  const perExtraMinuteCents = boundedInteger(input.perExtraMinuteCents, DEFAULT_DELAY_REVIEW_POLICY.perExtraMinuteCents, 0, 1_000);
  const maxCreditCents = boundedInteger(input.maxCreditCents, DEFAULT_DELAY_REVIEW_POLICY.maxCreditCents, baseCreditCents, 20_000);
  return { enabled: input.enabled !== false, reviewAfterMinutes, criticalAfterMinutes, baseCreditCents, perExtraMinuteCents, maxCreditCents };
}

export function recommendedDelayCreditCents(delayMinutes: number, policy: DelayReviewPolicy): number | null {
  if (!policy.enabled || !Number.isFinite(delayMinutes) || delayMinutes < policy.reviewAfterMinutes) return null;
  const extraMinutes = Math.max(0, Math.floor(delayMinutes) - policy.reviewAfterMinutes);
  return Math.min(policy.maxCreditCents, policy.baseCreditCents + extraMinutes * policy.perExtraMinuteCents);
}

export function delaySeverity(delayMinutes: number, issueCode: string | null, policy: DelayReviewPolicy): 'normal' | 'warning' | 'critical' {
  if (['unsafe_situation', 'damaged_order'].includes(issueCode ?? '') || delayMinutes >= policy.criticalAfterMinutes) return 'critical';
  if (issueCode || delayMinutes >= policy.reviewAfterMinutes) return 'warning';
  return 'normal';
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}
