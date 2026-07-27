#!/usr/bin/env node
/**
 * BlinkGo — Operator Account Setup (ALL-IN-ONE, IDEMPOTENT)
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Single-file end-to-end setup for the three operator accounts.
 * Runs with no manual steps. Exits 0 only if all three accounts can sign in.
 *
 * USAGE
 *   node scripts/setup-operator-accounts.mjs
 *
 * ENV (required)
 *   SUPABASE_URL                https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   sb_secret_…   (or legacy eyJ… JWT)
 *   SUPABASE_ANON_KEY           eyJ…           (long-lived anon public key)
 *
 * WHAT IT DOES (in order)
 *   1.  Uses the verified production schema (no DB introspection).
 *   2.  Creates the three auth.users rows via the Supabase Admin API.
 *       - Sets the password
 *       - Confirms the email (email_confirm: true) so login works immediately
 *       - Uses stable UUIDs so the rest of the app can reference them
 *   3.  Upserts the three public.users rows with the SAME UUIDs.
 *   4.  Upserts the public.drivers row (FK to auth.users.id).
 *   5.  Upserts the public.restaurants row (FK to public.users.id).
 *   6.  Sets public.users.restaurant_id for the restaurant operator.
 *   7.  Logs in with each of the three accounts using the ANON key,
 *       exactly the same way the BlinkGo browser app does.
 *
 * SCHEMA (verified production, hardcoded)
 *   public.users      : id, email, phone, name, role, avatar_url, is_verified,
 *                       is_active, firebase_uid, last_login_at, created_at,
 *                       updated_at, auth_provider, restaurant_id
 *   public.drivers    : id, full_name, phone, status, created_at, city, is_active,
 *                       is_available, vehicle_type, is_online
 *                       (id REFERENCES auth.users(id) ON DELETE CASCADE)
 *   public.restaurants: id, owner_id, name, description, logo_url, cover_url, address,
 *                       latitude, longitude, phone, email, cuisine (text[]),
 *                       is_verified, is_active, min_order_amount, delivery_fee,
 *                       estimated_delivery_time, opening_hours (jsonb),
 *                       delivery_zones (jsonb), rating, review_count,
 *                       created_at, updated_at, is_online
 *                       (owner_id REFERENCES public.users(id) ON DELETE SET NULL)
 *
 * CONSTRAINTS
 *   public.users:
 *     - PRIMARY KEY (id)
 *     - UNIQUE      (email, firebase_uid, phone)
 *     - CHECK       role IN ('customer', 'restaurant', 'driver', 'admin')
 *
 * UUIDs (stable, referenced from app/rbac.ts)
 *   Admin       00000000-0000-0000-0000-000000000004
 *   Driver      62e81b22-06f3-4217-adad-8839c29d64ff
 *   Restaurant  00000000-0000-0000-0000-000000000020
 *
 * DEFAULT PASSWORDS (operator MUST rotate before commercial launch)
 *   Admin       BlinkGoAdmin2026!
 *   Driver      BlinkGoDriver2026!
 *   Restaurant  BlinkGoWesseling2026!
 *
 * IDEMPOTENCY
 *   Every step uses either createUser+updateUserById or onConflict upsert.
 *   Re-running this script is safe and converges to the same state.
 *
 * EXIT CODES
 *   0  All three accounts verified and loginable
 *   1  Environment missing (SUPABASE_URL / keys)
 *   2  One or more logins failed
 *   3  Schema discovery failed (no longer applicable; kept for future)
 *
 * SECURITY
 *   This script REQUIRES the service-role key (for Admin API) and the
 *   anon key (for login verification, matching the browser path).
 *   Never commit them. Never expose them to the browser.
 * ════════════════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

// ════════════════════════════════════════════════════════════════════════════════
// Environment
// ════════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error('═══════════════════════════════════════════════');
  console.error('  Missing required environment variables');
  console.error('═══════════════════════════════════════════════');
  console.error('');
  console.error('  SUPABASE_URL                — required');
  console.error('  SUPABASE_SERVICE_ROLE_KEY   — required (Admin API)');
  console.error('  SUPABASE_ANON_KEY           — required (login verification)');
  console.error('');
  console.error('  Run:');
  console.error('    SUPABASE_URL=https://<ref>.supabase.co \\');
  console.error('    SUPABASE_SERVICE_ROLE_KEY=sb_secret_… \\');
  console.error('    SUPABASE_ANON_KEY=eyJ… \\');
  console.error('    node scripts/setup-operator-accounts.mjs');
  console.error('');
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════════
// Operator definitions
// ════════════════════════════════════════════════════════════════════════════════

const OPERATORS = [
  {
    id:   '00000000-0000-0000-0000-000000000004',
    email: 'admin@blinkgo.com',
    password: 'BlinkGoAdmin2026!',
    name: 'BlinkGo Admin',
    role: 'admin',
  },
  {
    id:   '62e81b22-06f3-4217-adad-8839c29d64ff',
    email: 'driver@blinkgo.com',
    password: 'BlinkGoDriver2026!',
    name: 'BlinkGo Driver',
    role: 'driver',
  },
  {
    id:   '00000000-0000-0000-0000-000000000020',
    email: 'wesseling@blinkgo.de',
    password: 'BlinkGoWesseling2026!',
    name: 'Wesseling Restaurant',
    role: 'restaurant',
  },
];

const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';

// ════════════════════════════════════════════════════════════════════════════════
// Verified production schema (HARDCODED — no DB introspection)
// ════════════════════════════════════════════════════════════════════════════════

const SCHEMA = {
  users: new Set([
    'id', 'email', 'phone', 'name', 'role', 'avatar_url', 'is_verified',
    'is_active', 'firebase_uid', 'last_login_at', 'created_at', 'updated_at',
    'auth_provider', 'restaurant_id',
  ]),
  drivers: new Set([
    'id', 'full_name', 'phone', 'status', 'created_at', 'city', 'is_active',
    'is_available', 'vehicle_type', 'is_online',
  ]),
  restaurants: new Set([
    'id', 'owner_id', 'name', 'description', 'logo_url', 'cover_url', 'address',
    'latitude', 'longitude', 'phone', 'email', 'cuisine', 'is_verified',
    'is_active', 'min_order_amount', 'delivery_fee', 'estimated_delivery_time',
    'opening_hours', 'delivery_zones', 'rating', 'review_count',
    'created_at', 'updated_at', 'is_online',
  ]),
};

// ════════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════════

const STEP = (n, label) => console.log(`\n── [${n}] ${label} ${'─'.repeat(Math.max(0, 60 - label.length))}`);
const OK   = (msg) => console.log(`   ✅ ${msg}`);
const INFO = (msg) => console.log(`   • ${msg}`);
const WARN = (msg) => console.log(`   ⚠️  ${msg}`);
const FAIL = (msg) => console.log(`   ❌ ${msg}`);

/**
 * Build a custom fetch that handles the new sb_secret_* key format.
 * PostgREST rejects Authorization: Bearer <sb_secret_…> with "unrecognized
 * JWT kid <nil>". GoTrue requires it. We strip Authorization for PostgREST
 * and keep it for GoTrue.
 */
function makeServiceFetch(key) {
  const isNewKey = key.startsWith('sb_secret_');
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = new Headers(init.headers || {});
    headers.set('apikey', key);
    const isGoTrue = url.includes('/auth/v1');
    if (isNewKey) {
      if (isGoTrue) {
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
      } else {
        headers.delete('Authorization');
      }
    } else {
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
    }
    return fetch(input, { ...init, headers });
  };
}

/**
 * Wait for a GoTrue read-after-write to settle. The same UUID can briefly
 * return 404 on GoTrue's read-replica after a successful createUser.
 * We retry with exponential backoff before giving up.
 */
async function waitForAuthUser(supabase, email, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (!error && data?.users) {
        const found = data.users.find((u) => u.email === email);
        if (found) return found;
      }
    } catch { /* swallow and retry */ }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 1 — Schema (verified at script compile time, not from DB)
// ════════════════════════════════════════════════════════════════════════════════

function useSchema() {
  STEP(1, 'Schema (verified production — hardcoded)');
  INFO(`public.users       : ${SCHEMA.users.size} columns`);
  INFO(`public.drivers     : ${SCHEMA.drivers.size} columns`);
  INFO(`public.restaurants : ${SCHEMA.restaurants.size} columns`);
  return SCHEMA;
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 2 — auth.users (Supabase Admin API)
// ════════════════════════════════════════════════════════════════════════════════

async function ensureAuthUser(supabase, op) {
  console.log(`\n   → ${op.email}  (id: ${op.id})`);

  // First, see if it already exists
  let existing = await waitForAuthUser(supabase, op.email, 2);

  if (existing) {
    INFO(`auth user exists (id: ${existing.id})`);
    if (existing.id !== op.id) {
      WARN(`existing id (${existing.id}) differs from canonical (${op.id})`);
      WARN(`using the existing id to avoid duplicate-email issues`);
    }
    const canonicalId = existing.id;
    const { error } = await supabase.auth.admin.updateUserById(canonicalId, {
      password: op.password,
      email_confirm: true,
      user_metadata: { name: op.name, role: op.role },
    });
    if (error) {
      FAIL(`updateUserById failed: ${error.message}`);
      return { ok: false, id: canonicalId };
    }
    OK(`auth user updated (password + email_confirm + metadata)`);
    return { ok: true, id: canonicalId, wasExisting: true };
  }

  // Try to create with the canonical id
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      id: op.id,
      email: op.email,
      password: op.password,
      email_confirm: true,
      user_metadata: { name: op.name, role: op.role },
    });
    if (error) throw error;
    OK(`auth user created (id: ${data.user.id})`);
    return { ok: true, id: data.user.id, wasExisting: false };
  } catch (err) {
    // Email may already be taken (soft-deleted from a previous attempt).
    // Wait for the read-replica and update by id.
    INFO(`createUser error: ${err.message}`);
    INFO(`waiting for auth.user to become visible on read-replica…`);
    const recovered = await waitForAuthUser(supabase, op.email, 6);
    if (recovered) {
      const { error: updateErr } = await supabase.auth.admin.updateUserById(recovered.id, {
        password: op.password,
        email_confirm: true,
        user_metadata: { name: op.name, role: op.role },
      });
      if (updateErr) {
        FAIL(`recovery update failed: ${updateErr.message}`);
        return { ok: false, id: recovered.id };
      }
      OK(`auth user recovered + updated (id: ${recovered.id})`);
      return { ok: true, id: recovered.id, wasExisting: true };
    }
    FAIL(`could not create or recover auth user: ${err.message}`);
    return { ok: false, id: op.id };
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 3 — public.users upsert
// ════════════════════════════════════════════════════════════════════════════════

async function syncPublicUser(supabase, op, userId, schema) {
  console.log(`\n   → ${op.email}  (id: ${userId})`);

  const cols = schema.users;
  const payload = { id: userId };

  if (cols.has('email'))         payload.email = op.email;
  if (cols.has('name'))          payload.name = op.name;
  if (cols.has('role'))          payload.role = op.role;
  if (cols.has('is_active'))     payload.is_active = true;
  if (cols.has('is_verified'))   payload.is_verified = true;
  if (cols.has('auth_provider')) payload.auth_provider = 'email';
  if (cols.has('last_login_at')) payload.last_login_at = new Date().toISOString();
  if (cols.has('created_at'))    payload.created_at = new Date().toISOString();
  if (cols.has('updated_at'))    payload.updated_at = new Date().toISOString();
  if (cols.has('avatar_url'))    payload.avatar_url = null;
  // The UNIQUE constraint on phone means we must leave it NULL or set it
  // to a unique value per row.
  if (cols.has('phone'))         payload.phone = null;
  if (cols.has('firebase_uid'))  payload.firebase_uid = null;
  if (cols.has('restaurant_id') && op.role === 'restaurant') {
    payload.restaurant_id = RESTAURANT_ID;
  }

  INFO(`setting ${Object.keys(payload).length} columns`);
  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
  if (error) {
    FAIL(`public.users upsert failed: ${error.message}`);
    return { ok: false };
  }
  OK(`public.users upserted (role: ${op.role})`);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 4 — public.drivers upsert
// (FK: public.drivers.id REFERENCES auth.users(id) — must match auth id)
// ════════════════════════════════════════════════════════════════════════════════

async function syncDriver(supabase, userId, schema) {
  console.log(`\n   → driver profile (id: ${userId})`);

  const cols = schema.drivers;
  const payload = { id: userId };
  if (cols.has('full_name'))    payload.full_name = 'BlinkGo Driver';
  if (cols.has('phone'))        payload.phone = null;
  if (cols.has('status'))       payload.status = 'active';
  if (cols.has('created_at'))   payload.created_at = new Date().toISOString();
  if (cols.has('city'))         payload.city = 'Wesseling';
  if (cols.has('is_active'))    payload.is_active = true;
  if (cols.has('is_available')) payload.is_available = true;
  if (cols.has('vehicle_type')) payload.vehicle_type = 'bike';
  if (cols.has('is_online'))    payload.is_online = false;

  const { error } = await supabase.from('drivers').upsert(payload, { onConflict: 'id' });
  if (error) {
    FAIL(`public.drivers upsert failed: ${error.message}`);
    return { ok: false };
  }
  OK(`public.drivers upserted (${Object.keys(payload).length} columns)`);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 5 — public.restaurants upsert
// (FK: public.restaurants.owner_id REFERENCES public.users(id))
// ════════════════════════════════════════════════════════════════════════════════

async function syncRestaurant(supabase, ownerId, schema) {
  console.log(`\n   → Wesseling restaurant (id: ${RESTAURANT_ID}, owner: ${ownerId})`);

  const cols = schema.restaurants;
  const payload = {
    id: RESTAURANT_ID,
    owner_id: ownerId,
    name: 'Wesseling Restaurant',
    address: 'Wesseling, Deutschland',
    latitude: 50.8208,
    longitude: 6.9786,
    is_online: false,
  };

  if (cols.has('description'))             payload.description = 'Authentische Küche direkt aus Wesseling — frisch, schnell, zuverlässig.';
  if (cols.has('logo_url'))                payload.logo_url = null;
  if (cols.has('cover_url'))               payload.cover_url = null;
  if (cols.has('phone'))                   payload.phone = null;
  if (cols.has('email'))                   payload.email = 'wesseling@blinkgo.de';
  if (cols.has('cuisine'))                 payload.cuisine = ['Deutsch', 'Pizza', 'Burger'];
  if (cols.has('is_active'))               payload.is_active = true;
  if (cols.has('is_verified'))             payload.is_verified = true;
  if (cols.has('min_order_amount'))         payload.min_order_amount = 10.00;
  if (cols.has('delivery_fee'))            payload.delivery_fee = 2.99;
  if (cols.has('estimated_delivery_time')) payload.estimated_delivery_time = '25-35 min';
  if (cols.has('opening_hours'))           payload.opening_hours = {
    monday:    { open: '09:00', close: '22:00', closed: false },
    tuesday:   { open: '09:00', close: '22:00', closed: false },
    wednesday: { open: '09:00', close: '22:00', closed: false },
    thursday:  { open: '09:00', close: '22:00', closed: false },
    friday:    { open: '09:00', close: '23:00', closed: false },
    saturday:  { open: '10:00', close: '23:00', closed: false },
    sunday:    { open: '11:00', close: '22:00', closed: false },
  };
  if (cols.has('delivery_zones'))          payload.delivery_zones = null;
  if (cols.has('rating'))                  payload.rating = 4.7;
  if (cols.has('review_count'))            payload.review_count = 0;
  if (cols.has('created_at'))              payload.created_at = new Date().toISOString();
  if (cols.has('updated_at'))              payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('restaurants').upsert(payload, { onConflict: 'id' });
  if (error) {
    FAIL(`public.restaurants upsert failed: ${error.message}`);
    return { ok: false };
  }
  OK(`public.restaurants upserted (${Object.keys(payload).length} columns)`);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════════
// Step 6 — verify all three logins (using the ANON key — same as the browser)
// ════════════════════════════════════════════════════════════════════════════════

async function verifyLogin(op) {
  console.log(`\n   → ${op.email}`);

  // Fresh client for each test so a failed login in one test does not
  // leak a session into the next. This client uses ONLY the anon key,
  // which is exactly the same path the BlinkGo browser app takes.
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await anonClient.auth.signInWithPassword({
    email: op.email,
    password: op.password,
  });
  if (error) {
    FAIL(`login failed: ${error.message}`);
    return false;
  }
  if (!data?.user) {
    FAIL('no user in response');
    return false;
  }
  OK(`login OK (user id: ${data.user.id}, email confirmed: ${!!data.user.email_confirmed_at})`);

  // Sign out so the next test starts clean
  await anonClient.auth.signOut();
  return true;
}

// ════════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  BlinkGo — Operator Account Setup (all-in-one)');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Target: ${SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
  console.log(`  Service key prefix: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 12)}…`);
  console.log(`  Anon key prefix:     ${SUPABASE_ANON_KEY.substring(0, 12)}…`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: makeServiceFetch(SUPABASE_SERVICE_ROLE_KEY) },
  });

  // Step 1 — schema (verified, hardcoded — no DB query)
  const schema = useSchema();

  // Step 2 — auth.users
  STEP(2, 'auth.users via Admin API');
  const authResults = [];
  for (const op of OPERATORS) {
    const r = await ensureAuthUser(supabase, op);
    authResults.push({ op, ...r });
  }
  const authOk = authResults.every((r) => r.ok);
  if (!authOk) {
    FAIL('One or more auth users failed. Stopping.');
    console.log('\n');
    process.exit(2);
  }

  // Step 3 — public.users
  STEP(3, 'public.users');
  const userResults = [];
  for (const { op, id, ok } of authResults) {
    if (!ok) continue;
    const r = await syncPublicUser(supabase, op, id, schema);
    userResults.push({ op, id, ...r });
  }
  const usersOk = userResults.every((r) => r.ok);
  if (!usersOk) {
    FAIL('One or more public.users upserts failed. Continuing to driver/restaurant…');
  }

  // Step 4 — public.drivers (for the driver operator only)
  STEP(4, 'public.drivers');
  const driverEntry = authResults.find((r) => r.op.role === 'driver');
  if (driverEntry?.ok) {
    await syncDriver(supabase, driverEntry.id, schema);
  } else {
    WARN('driver auth user not OK — skipping driver profile');
  }

  // Step 5 — public.restaurants (for the restaurant operator only)
  STEP(5, 'public.restaurants');
  const restEntry = authResults.find((r) => r.op.role === 'restaurant');
  if (restEntry?.ok) {
    await syncRestaurant(supabase, restEntry.id, schema);
  } else {
    WARN('restaurant auth user not OK — skipping restaurant row');
  }

  // Step 6 — verify all three logins using the ANON key (browser path)
  STEP(6, 'Verifying all three logins via ANON key (browser path)');
  const loginResults = [];
  for (const op of OPERATORS) {
    const ok = await verifyLogin(op);
    loginResults.push({ op, ok });
  }

  // Final report
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Final Report');
  console.log('══════════════════════════════════════════════════════════════');
  for (const { op, ok } of loginResults) {
    const status = ok ? '✅ READY' : '❌ FAILED';
    console.log(`  ${status}  ${op.email.padEnd(28)}  password=${op.password}`);
  }
  console.log('');

  const allOk = loginResults.every((r) => r.ok);
  if (allOk) {
    console.log('  All three accounts are loginable. Setup complete.');
    console.log('');
    console.log('  Login URLs:');
    console.log('    /login → admin@blinkgo.com       / BlinkGoAdmin2026!     → /admin');
    console.log('    /login → driver@blinkgo.com      / BlinkGoDriver2026!    → /driver/dashboard');
    console.log('    /login → wesseling@blinkgo.de    / BlinkGoWesseling2026! → /restaurant/dashboard');
    console.log('');
    process.exit(0);
  } else {
    console.log('  One or more accounts cannot log in. See errors above.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('═══════════════════════════════════════════════');
  console.error('  FATAL');
  console.error('═══════════════════════════════════════════════');
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
