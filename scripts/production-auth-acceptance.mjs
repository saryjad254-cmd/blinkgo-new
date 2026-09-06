#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

for (const file of ['.env.staging.local', '.env.staging.secrets.local', '.env.local']) {
  dotenv.config({ path: file, override: false, quiet: true });
}

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'admin@blinkgo.com';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'BlinkGoAdmin2026!';
const PASSWORD = 'LaunchAcceptance!2026';
const NEW_PASSWORD = 'LaunchRecovered!2026';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error('Real Supabase environment variables are required');
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const cookies = new Map();
const created = { drivers: [], restaurants: [], users: [] };
const results = [];
let rateLimits = 0;

function record(name, passed, details = '') {
  results.push({ name, passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
  if (!passed) throw new Error(`${name}: ${details || 'failed'}`);
}

function storeCookies(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : headers.get('set-cookie') ? [headers.get('set-cookie')] : [];
  for (const value of values) {
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (cookieValue) cookies.set(name, cookieValue);
    else cookies.delete(name);
  }
}

function retryAfterMs(value) {
  if (!value) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1_000, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, date - Date.now()) : 60_000;
}

async function api(path, init = {}, { retry429 = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = {
      'Content-Type': 'application/json',
      Origin: BASE,
      'x-forwarded-for': '198.51.100.42',
      ...(init.headers || {}),
    };
    if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init, headers });
    storeCookies(response.headers);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
    if (response.status !== 429 || !retry429 || attempt === 1) {
      return { response, body };
    }
    rateLimits += 1;
    const delay = retryAfterMs(response.headers.get('retry-after'));
    console.log(`RATE_LIMIT 429 — respecting Retry-After for ${Math.ceil(delay / 1000)} seconds`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('unreachable');
}

function unwrap(body) {
  return body?.ok === true && body?.data ? body.data : body;
}

async function activateInvite(email, role, password) {
  const generated = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${BASE}/auth/accept-invite` },
  });
  if (generated.error) throw generated.error;
  const tokenHash = generated.data.properties?.hashed_token;
  if (!tokenHash) throw new Error(`No invite token hash generated for ${role}`);
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await client.auth.verifyOtp({ type: 'invite', token_hash: tokenHash });
  if (verified.error || !verified.data.session) throw verified.error || new Error('Invite token did not create a session');
  const updated = await client.auth.updateUser({ password });
  if (updated.error) throw updated.error;
  await client.auth.signOut({ scope: 'local' });
}

async function cleanup() {
  for (const restaurant of created.restaurants.reverse()) {
    await service.from('restaurant_verifications').delete().eq('restaurant_id', restaurant.id);
    await service.from('products').delete().eq('restaurant_id', restaurant.id);
    await service.from('restaurants').delete().eq('id', restaurant.id);
  }
  for (const id of created.drivers.reverse()) await service.from('drivers').delete().eq('id', id);
  for (const user of created.users.reverse()) {
    await service.from('email_otps').delete().eq('user_id', user.id);
    await service.from('password_reset_tokens').delete().eq('email', user.email);
    await service.from('legal_acceptance_records').delete().eq('user_id', user.id);
    await service.from('users').delete().eq('id', user.id);
    await service.auth.admin.deleteUser(user.id).catch(() => undefined);
  }
}

async function run() {
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const driverEmail = `launch-driver-${suffix}@blinkgo-test.de`;
  const restaurantEmail = `launch-restaurant-${suffix}@blinkgo-test.de`;
  const customerEmail = `launch-customer-${suffix}@blinkgo-test.de`;

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  record('admin authentication prerequisite', login.response.status === 200, `HTTP ${login.response.status}`);

  const driver = await api('/api/admin/drivers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Launch Driver Acceptance', email: driverEmail, phone: '+4915112345678',
      vehicle_type: 'ebike', city: 'Wesseling',
    }),
  }, { retry429: true });
  const driverBody = unwrap(driver.body);
  const driverId = driverBody?.driver?.id;
  record('driver invitation request', driver.response.status === 201 && driverBody?.activation === 'invite_sent' && driverId, `HTTP ${driver.response.status}`);
  created.drivers.push(driverId);
  created.users.push({ id: driverId, email: driverEmail });
  const driverAuth = await service.auth.admin.getUserById(driverId);
  record('driver invitation persisted with trusted role', driverAuth.data.user?.app_metadata?.app_role === 'driver', 'app_role=driver');
  await activateInvite(driverEmail, 'driver', PASSWORD);
  record('driver invitation token verification', true, 'real invite token verified and password set');

  const restaurant = await api('/api/admin/restaurants', {
    method: 'POST',
    body: JSON.stringify({
      name: `Launch Restaurant ${suffix}`,
      category: 'Acceptance', description: 'Production auth acceptance fixture',
      address: 'Teststr. 1, 50389 Wesseling', phone: '+492236123456',
      owner_name: 'Launch Restaurant Owner', owner_email: restaurantEmail,
      legal_name: `Launch Restaurant ${suffix} e.K.`, legal_form: 'e.K.',
      representative_name: 'Launch Restaurant Owner', contact_email: restaurantEmail,
      contact_phone: '+492236123456', street_address: 'Teststr. 1', postal_code: '50389',
      legal_city: 'Wesseling', trade_register_name: 'Amtsgericht Köln',
      trade_register_number: `HRA${String(Date.now()).slice(-8)}`,
      vat_id: 'DE123456789',
      identity_document_ref: `private://merchant-documents/${suffix}/identity.pdf`,
      business_document_ref: `private://merchant-documents/${suffix}/register.pdf`,
      payout_account_last4: '2026', self_certified: true,
      delivery_radius_km: 5, delivery_fee: 2.99, min_order_amount: 12,
      commission_pct: 15,
    }),
  }, { retry429: true });
  const restaurantBody = unwrap(restaurant.body);
  const restaurantId = restaurantBody?.restaurant?.id;
  const ownerId = restaurantBody?.owner?.id;
  record('restaurant invitation request', restaurant.response.status === 201 && restaurantBody?.activation === 'invite_sent' && restaurantId && ownerId, `HTTP ${restaurant.response.status}`);
  created.restaurants.push({ id: restaurantId });
  created.users.push({ id: ownerId, email: restaurantEmail });
  const restaurantAuth = await service.auth.admin.getUserById(ownerId);
  record('restaurant invitation persisted with trusted role', restaurantAuth.data.user?.app_metadata?.app_role === 'restaurant', 'app_role=restaurant');
  await activateInvite(restaurantEmail, 'restaurant', PASSWORD);
  record('restaurant invitation token verification', true, 'real invite token verified and password set');

  const registration = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Launch Customer Acceptance', email: customerEmail, password: PASSWORD,
      role: 'customer', acceptedTerms: true,
      termsVersion: '2026-08-24-draft', privacyVersion: '2026-08-24-draft', locale: 'de',
    }),
  });
  const registrationBody = unwrap(registration.body);
  const customerId = registrationBody?.userId;
  record('customer signup', registration.response.status === 200 && customerId, `HTTP ${registration.response.status}`);
  created.users.push({ id: customerId, email: customerEmail });

  // Mint (without sending) a real GoTrue magic-link token so automation can
  // simulate opening the link that the current Supabase email template sends.
  const signupLink = await service.auth.admin.generateLink({ type: 'magiclink', email: customerEmail });
  if (signupLink.error) throw signupLink.error;
  const signupHash = signupLink.data.properties?.hashed_token;
  if (!signupHash) throw new Error('Supabase signup magic-link token was not generated');
  const signupClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const confirmation = await signupClient.auth.verifyOtp({ type: 'email', token_hash: signupHash });
  record('customer signup confirmation', !confirmation.error && Boolean(confirmation.data.session), 'real Supabase email token verified');

  const customerAppLogin = await api('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: customerEmail, password: PASSWORD }),
  });
  record('confirmed customer app login', customerAppLogin.response.status === 200, `HTTP ${customerAppLogin.response.status}`);
  const customerAuth = await service.auth.admin.getUserById(customerId);
  const customerProfile = await service.from('users').select('is_verified,role').eq('id', customerId).single();
  record('customer confirmation persisted', Boolean(customerAuth.data.user?.email_confirmed_at) && customerProfile.data?.is_verified === true && customerProfile.data?.role === 'customer', 'auth + public profile verified');

  const recoveryRequest = await api('/api/auth/reset-password', {
    method: 'POST', body: JSON.stringify({ email: customerEmail }),
  });
  record('password recovery email request', recoveryRequest.response.status === 200 && recoveryRequest.body?.ok === true, `HTTP ${recoveryRequest.response.status}`);

  const recoveryLink = await service.auth.admin.generateLink({
    type: 'recovery', email: customerEmail,
    options: { redirectTo: `${BASE}/login` },
  });
  if (recoveryLink.error) throw recoveryLink.error;
  const recoveryHash = recoveryLink.data.properties?.hashed_token;
  if (!recoveryHash) throw new Error('Recovery token hash missing');
  const recoveryClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const recoveryVerification = await recoveryClient.auth.verifyOtp({ type: 'recovery', token_hash: recoveryHash });
  record('recovery token verification', !recoveryVerification.error && Boolean(recoveryVerification.data.session), 'real Supabase recovery token verified');
  const passwordUpdate = await recoveryClient.auth.updateUser({ password: NEW_PASSWORD });
  record('password recovery completion', !passwordUpdate.error, 'password updated through authenticated recovery session');
  const recoveredLogin = await createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: customerEmail, password: NEW_PASSWORD });
  record('recovered password login', !recoveredLogin.error && Boolean(recoveredLogin.data.session), 'new password accepted');

  const callback = await fetch(`${BASE}/auth/callback?error=access_denied&error_description=acceptance&lang=de`, { redirect: 'manual' });
  const callbackLocation = callback.headers.get('location') || '';
  record('auth callback error routing', [302, 303, 307, 308].includes(callback.status) && callbackLocation.includes('/login?error=oauth_access_denied'), `HTTP ${callback.status}`);
}

try {
  await run();
} finally {
  await cleanup();
  console.log(`RATE_LIMIT_429_COUNT ${rateLimits}`);
  console.log(`SUMMARY ${results.filter((result) => result.passed).length}/${results.length} passed`);
}
