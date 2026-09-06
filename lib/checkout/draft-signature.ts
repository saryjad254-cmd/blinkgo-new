import crypto from 'crypto';

function getDraftSecret(): string {
  const configured = process.env.DRAFT_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DRAFT_SIGNING_SECRET must be set in production');
  }
  return 'blinkgo-draft-secret-development-only-do-not-use-in-production';
}

export function signCheckoutDraft(draft: Record<string, unknown>): string {
  const canonical = JSON.stringify(draft, Object.keys(draft).sort());
  return crypto.createHmac('sha256', getDraftSecret()).update(canonical).digest('hex');
}

export function verifyCheckoutDraftSignature(draft: Record<string, unknown>, storedSignature?: string | null): boolean {
  const embeddedSignature = typeof draft.signature === 'string' ? draft.signature : '';
  const signature = storedSignature || embeddedSignature;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const unsigned = { ...draft };
  delete unsigned.signature;
  const expected = signCheckoutDraft(unsigned);
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
