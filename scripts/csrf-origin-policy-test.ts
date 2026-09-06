import assert from 'node:assert/strict';
import { isTrustedCsrfOrigin, type CsrfOriginOptions } from '../lib/security/csrf-origin';

let passed = 0;

function expect(label: string, expected: boolean, options: CsrfOriginOptions) {
  assert.equal(isTrustedCsrfOrigin(options), expected, label);
  passed += 1;
  console.log(`  PASS ${label}`);
}

const production = {
  requestOrigin: 'https://www.blinkgo.de',
  forwardedHost: 'www.blinkgo.de',
  forwardedProto: 'https',
  nodeEnv: 'production',
  appUrls: 'https://www.blinkgo.de,https://blinkgo.de',
  allowedOrigins: 'https://admin.blinkgo.de',
};

console.log('\nBlinkGo CSRF origin policy');

expect('production same-origin request', true, { ...production, source: 'https://www.blinkgo.de' });
expect('production same-origin Referer path', true, { ...production, source: 'https://www.blinkgo.de/checkout?step=pay' });
expect('production canonical apex origin', true, { ...production, source: 'https://blinkgo.de' });
expect('production explicitly configured admin origin', true, { ...production, source: 'https://admin.blinkgo.de' });
expect('production forwarded deployment origin', true, {
  ...production,
  requestOrigin: 'http://internal:3000',
  forwardedHost: 'www.blinkgo.de',
  source: 'https://www.blinkgo.de/cart',
});
expect('unconfigured Vercel tenant is blocked in production', false, { ...production, source: 'https://attacker.vercel.app' });
expect('unconfigured BlinkGo subdomain is blocked in production', false, { ...production, source: 'https://evil.admin.blinkgo.de' });
expect('lookalike BlinkGo domain is blocked', false, { ...production, source: 'https://www.blinkgo.de.evil.example' });
expect('production tunnel domain is blocked', false, { ...production, source: 'https://attack.trycloudflare.com' });
expect('production localhost is blocked', false, { ...production, source: 'http://localhost:3000' });
expect('non-HTTP origin is blocked', false, { ...production, source: 'file:///tmp/request' });
expect('malformed origin is blocked', false, { ...production, source: 'not a URL' });

const development = {
  requestOrigin: 'http://localhost:3000',
  nodeEnv: 'development',
};
expect('development loopback origin is allowed', true, { ...development, source: 'http://localhost:3100' });
expect('development tunnel origin is allowed', true, { ...development, source: 'https://blinkgo.trycloudflare.com' });
expect('development tunnel lookalike is blocked', false, { ...development, source: 'https://trycloudflare.com.evil.example' });

console.log(`\nCSRF origin policy: ${passed}/${passed} passed\n`);
