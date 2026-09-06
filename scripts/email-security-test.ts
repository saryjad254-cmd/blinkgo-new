import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 're_test_only_not_a_secret';
process.env.EMAIL_FROM = 'BlinkGo <noreply@blinkgo.de>';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

const calls: Array<{ url: string; init: RequestInit }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  calls.push({ url: String(input), init });
  return new Response(JSON.stringify({ id: 'email_test_1' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

let passed = 0;
function test(name: string, assertion: () => void) {
  assertion();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function main() {
try {
  const { __emailTesting: otpTesting, sendOTPEmail } = await import('../lib/email-service');
  const { __emailTesting: resetTesting, sendPasswordResetEmail } = await import('../lib/email-password-reset');
  const { assertEmailAddress, assertTrustedEmailUrl, emailIdempotencyKey } = await import('../lib/integrations/email/safety');
  const { readFileSync } = await import('node:fs');

  for (const locale of ['de', 'ar', 'en'] as const) {
    const built = otpTesting.buildOtpEmail({ to: 'customer@example.com', code: '123456', name: '<img src=x onerror=alert(1)>', locale });
    test(`OTP ${locale} is localized and escapes user HTML`, () => {
      assert.match(built.html, new RegExp(`lang="${locale}"`));
      assert.doesNotMatch(built.html, /<img src=x/);
      assert.match(built.html, /&lt;img/);
      if (locale === 'ar') assert.match(built.html, /dir="rtl"/);
    });
  }

  test('Direct OTP email uses the official production branding asset and legal footer', () => {
    const built = otpTesting.buildOtpEmail({ to: 'customer@example.com', code: '123456', locale: 'de' });
    assert.match(built.html, /https:\/\/www\.blinkgo\.de\/brand\/blinkgo-email-logo\.png/);
    assert.match(built.html, /alt="BlinkGo"/);
    assert.match(built.html, /https:\/\/www\.blinkgo\.de\/legal\/datenschutz/);
    assert.match(built.html, /https:\/\/www\.blinkgo\.de\/legal\/agb/);
  });

  test('OTP rejects non-six-digit codes', () => {
    assert.throws(() => otpTesting.buildOtpEmail({ to: 'customer@example.com', code: '<script>', locale: 'de' }));
  });
  test('Recipient validation rejects malformed addresses', () => {
    assert.throws(() => assertEmailAddress('not-an-email'));
  });
  test('Email action URLs reject foreign origins', () => {
    assert.throws(() => assertTrustedEmailUrl('https://attacker.example/reset?token=x'));
  });
  test('Email action URLs accept the configured application origin', () => {
    assert.equal(new URL(assertTrustedEmailUrl('http://localhost:3000/reset-password?token=x')).origin, 'http://localhost:3000');
  });
  test('Idempotency keys are stable without exposing the token', () => {
    const key = emailIdempotencyKey('password-reset', 'secret-token');
    assert.equal(key, emailIdempotencyKey('password-reset', 'secret-token'));
    assert.doesNotMatch(key, /secret-token/);
  });

  const otpResult = await sendOTPEmail({ to: 'customer@example.com', code: '654321', locale: 'ar' });
  test('OTP uses the real provider adapter', () => assert.equal(otpResult.ok, true));
  test('OTP passes a provider idempotency header', () => {
    const headers = new Headers(calls.at(-1)?.init.headers);
    assert.match(headers.get('Idempotency-Key') || '', /^blinkgo-email-verification-/);
  });

  const resetLink = 'http://localhost:3000/reset-password?token=sensitive-token&email=user%40example.com';
  const resetBuilt = resetTesting.buildPasswordResetEmail({
    to: 'user@example.com', name: '<script>alert(1)</script>', resetLink, locale: 'ar',
  });
  test('Password reset escapes names and preserves RTL', () => {
    assert.doesNotMatch(resetBuilt.html, /<script>/);
    assert.match(resetBuilt.html, /&lt;script&gt;/);
    assert.match(resetBuilt.html, /dir="rtl"/);
  });
  test('Direct password reset email uses the official production branding asset and footer', () => {
    assert.match(resetBuilt.html, /https:\/\/www\.blinkgo\.de\/brand\/blinkgo-email-logo\.png/);
    assert.match(resetBuilt.html, /alt="BlinkGo"/);
    assert.match(resetBuilt.html, /https:\/\/www\.blinkgo\.de\/help/);
    assert.match(resetBuilt.html, /https:\/\/www\.blinkgo\.de\/legal\/datenschutz/);
    assert.match(resetBuilt.html, /https:\/\/www\.blinkgo\.de\/legal\/agb/);
  });
  const resetResult = await sendPasswordResetEmail({ to: 'user@example.com', resetLink, locale: 'de' });
  test('Password reset uses the real provider adapter', () => assert.equal(resetResult.ok, true));
  test('Password reset idempotency key does not expose its token', () => {
    const headers = new Headers(calls.at(-1)?.init.headers);
    const key = headers.get('Idempotency-Key') || '';
    assert.match(key, /^blinkgo-password-reset-/);
    assert.doesNotMatch(key, /sensitive-token/);
  });
  test('Signed delivery webhook records only recipient hashes', () => {
    const source = readFileSync('app/api/webhooks/resend/route.ts', 'utf8');
    assert.match(source, /webhooks\.verify/);
    assert.match(source, /recipient_hashes/);
    assert.doesNotMatch(source, /recipient_emails/);
  });
  test('Bounce and complaint events create durable suppressions', () => {
    const migration = readFileSync('deploy/supabase/71-email-delivery.sql', 'utf8');
    const source = readFileSync('app/api/webhooks/resend/route.ts', 'utf8');
    assert.match(migration, /email_suppressions/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(source, /email\.bounced/);
    assert.match(source, /email\.complained/);
  });

  console.log(`\nEmail security: ${passed}/${passed} passed`);
} finally {
  globalThis.fetch = originalFetch;
}
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
