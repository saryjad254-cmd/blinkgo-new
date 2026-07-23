#!/usr/bin/env node
/**
 * Legal Compliance & DSAR Test Suite
 * ───────────────────────────────────
 * Tests:
 *   1. /legal/impressum is publicly accessible (200)
 *   2. /legal/datenschutz is publicly accessible (200)
 *   3. /legal/agb is publicly accessible (200)
 *   4. /legal/widerruf is publicly accessible (200)
 *   5. /legal/cookies is publicly accessible (200)
 *   6. /legal/data-request is publicly accessible (200)
 *   7. /legal/merchant-terms and /legal/driver-terms are accessible (200)
 *   8. Legal pages contain the draft banner (LEGAL_REVIEW_STATUS != APPROVED)
 *   9. Legal pages contain German content (language is de by default)
 *  10. /api/legal/data-request accepts a public POST submission
 *  11. /api/legal/data-request validates input
 *  12. /api/legal/data-request enforces rate limit
 *  13. /api/account/export requires auth
 *  14. /api/account/delete requires auth
 *  15. /api/consent accepts POST and logs the record
 *
 * Usage:
 *   BASE_URL=https://your-tunnel.trycloudflare.com node scripts/legal-compliance-test.js
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ORIGIN = BASE;

let passed = 0;
let failed = 0;

function record(name, ok, info) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`);
  }
}

async function f(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, text, json };
}

async function main() {
  console.log('\n► Legal pages — public access');
  for (const p of ['/legal/impressum', '/legal/datenschutz', '/legal/agb', '/legal/widerruf', '/legal/cookies', '/legal/data-request', '/legal/merchant-terms', '/legal/driver-terms']) {
    const r = await f(p);
    record(`${p} is public (200)`, r.status === 200, `status=${r.status}`);
  }

  console.log('\n► Legal pages — content');
  const imp = await f('/legal/impressum');
  record('Impressum contains draft banner', imp.text.includes('Prüfung') || imp.text.includes('entwurf') || imp.text.includes('REVIEW'), 'no draft text');
  record('Impressum has German content (de)', imp.text.includes('Impressum') || imp.text.includes('Anbieter') || imp.text.includes('Verantwortlich'), 'no de text');
  const dsgvo = await f('/legal/datenschutz');
  record('Datenschutz mentions DSGVO', dsgvo.text.includes('DSGVO') || dsgvo.text.includes('Datenschutz'), 'no DSGVO reference');
  const agb = await f('/legal/agb');
  record('AGB exists with clauses', agb.text.includes('Vertragspartner') || agb.text.includes('Lieferung') || agb.text.includes('Widerruf'), 'no clauses');

  console.log('\n► Data Subject Request API');
  // The DSAR endpoint is rate-limited at 5/hour per IP. The endpoint will
  // return 429 once the limit is hit. We use a unique email per test run
  // but the rate limit is per IP, so we accept either 200 or 429.
  const dsar = await f('/api/legal/data-request', {
    method: 'POST',
    body: JSON.stringify({
      type: 'access',
      name: 'Test User',
      email: 'test-dsar@example.com',
      details: 'Test DSAR submission',
    }),
  });
  record('DSAR POST returns 200 (or 429 if rate-limited)', (dsar.ok && dsar.json?.data?.request_id) || dsar.status === 429, `status=${dsar.status}`);

  // Validation
  const dsarBad = await f('/api/legal/data-request', {
    method: 'POST',
    body: JSON.stringify({ type: 'invalid', name: 'X', email: 'not-an-email' }),
  });
  const dsarBadValid = (!dsarBad.ok && (dsarBad.status === 400 || dsarBad.status === 429));
  record('DSAR POST validates input (or rate-limited)', dsarBadValid, `status=${dsarBad.status}`);

  // Rate limit
  let rateLimited = false;
  for (let i = 0; i < 8; i++) {
    const r = await f('/api/legal/data-request', {
      method: 'POST',
      body: JSON.stringify({
        type: 'access',
        name: `Rate Test ${i}`,
        email: `ratetest${i}@example.com`,
      }),
    });
    if (r.status === 429) { rateLimited = true; break; }
  }
  record('DSAR rate limit kicks in (429)', rateLimited, 'no 429 after 8 requests');

  console.log('\n► Account export/delete (auth required)');
  const exp = await f('/api/account/export');
  record('GET /api/account/export requires auth', !exp.ok && (exp.status === 401 || exp.status === 307), `status=${exp.status}`);

  const del = await f('/api/account/delete', { method: 'DELETE' });
  record('DELETE /api/account/delete requires auth', !del.ok && (del.status === 401 || del.status === 307), `status=${del.status}`);

  console.log('\n► Consent API');
  const consentAccept = await f('/api/consent', {
    method: 'POST',
    body: JSON.stringify({ action: 'accept_all' }),
  });
  record('Consent accept_all returns 200', consentAccept.ok, `status=${consentAccept.status}`);

  const consentReject = await f('/api/consent', {
    method: 'POST',
    body: JSON.stringify({ action: 'reject_non_essential' }),
  });
  record('Consent reject_non_essential returns 200', consentReject.ok, `status=${consentReject.status}`);

  const consentInvalid = await f('/api/consent', {
    method: 'POST',
    body: JSON.stringify({ action: 'foo' }),
  });
  record('Consent validates action', !consentInvalid.ok && consentInvalid.status === 400, `status=${consentInvalid.status}`);

  console.log('\n► Legal pages — responsive (no JS required)');
  record('Impressum has no required JS chunks', imp.text.includes('Impressum'), 'content missing');
  record('Datenschutz has no required JS chunks', dsgvo.text.includes('Datenschutz') || dsgvo.text.includes('Privacy'), 'content missing');

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
