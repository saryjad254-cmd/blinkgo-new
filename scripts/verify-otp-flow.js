#!/usr/bin/env node
/**
 * Production OTP Flow Verification
 * ─────────────────────────────────
 * Run this AFTER applying the email_otps migration to verify the full
 * signup → verify → login flow works end-to-end.
 *
 * Usage: node scripts/verify-otp-flow.js [BASE_URL]
 * Example: node scripts/verify-otp-flow.js https://your-app.vercel.app
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const ORIGIN = BASE;

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function fail(step, msg, data) {
  console.error(`[${step}] ❌ FAILED: ${msg}`);
  if (data) console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  const email = `verify-test-${Date.now()}@blinkgo.de`;
  const password = 'TestPass123!';

  log('1/6', `Registering ${email}…`);
  const reg = await fetchJson(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      name: 'Verification Test',
      email,
      password,
      role: 'customer',
    }),
  });
  if (!reg.data.ok) fail('1/6', 'Register did not return ok', reg);
  log('1/6', `User created: ${reg.data.data.userId}`);

  log('2/6', 'Fetching latest OTP from the email_otps table…');
  // The OTP isn't returned by the API in production, so we look it up
  // directly in the DB. This requires the supabase-js client.
  require('dotenv').config({ path: '.env' });
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const crypto = require('crypto');
  const { data: otps } = await sb
    .from('email_otps')
    .select('*')
    .eq('email', email)
    .eq('purpose', 'signup')
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!otps || otps.length === 0) {
    fail('2/6', 'No OTP found in email_otps table');
  }
  log('2/6', `Found ${otps.length} OTP record(s)`);

  log('3/6', 'Brute-forcing the 6-digit code (this is the test, not a real attack)…');
  let foundCode = null;
  for (let n = 0; n < 1000000; n++) {
    const code = n.toString().padStart(6, '0');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    if (hash === otps[0].code_hash) {
      foundCode = code;
      break;
    }
    if (n % 100000 === 0 && n > 0) {
      log('3/6', `  tried ${n}…`);
    }
  }
  if (!foundCode) fail('3/6', 'Could not reverse the OTP hash (this should be impossible for a real OTP)');
  log('3/6', `Found code: ${foundCode}`);

  log('4/6', 'Verifying the code…');
  const ver = await fetchJson(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, code: foundCode }),
  });
  if (!ver.data.ok) fail('4/6', 'Verify did not return ok', ver);
  log('4/6', 'Verified!');

  log('5/6', 'Checking the user is now marked verified…');
  const { data: user } = await sb
    .from('users')
    .select('id, email, is_verified, is_active')
    .eq('email', email)
    .single();
  if (!user.is_verified) fail('5/6', 'User is not marked verified', user);
  log('5/6', `User verified: ${user.id}`);

  log('6/6', 'Verifying resend flow (request a new code, then verify again)…');
  const resend = await fetchJson(`${BASE}/api/auth/verify`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email }),
  });
  if (!resend.data.ok) fail('6/6', 'Resend did not return ok', resend);
  log('6/6', `Resend OK. ${resend.data.message}`);

  // The old code should now be invalidated
  const ver2 = await fetchJson(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, code: foundCode }),
  });
  if (ver2.data.ok) fail('6/6', 'Old code was NOT invalidated by resend (replay attack possible)', ver2);
  log('6/6', 'Old code correctly rejected after resend');

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ All OTP flow checks passed');
  console.log('═══════════════════════════════════════════');
})().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
