#!/usr/bin/env node
/**
 * BlinkGo — Operator Account Password Seeder
 * ────────────────────────────────────────────
 *
 * Creates the three canonical operator accounts in Supabase Auth
 * (with bcrypt-hashed passwords) AND syncs them to public.users
 * with the correct role.
 *
 * USAGE:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \
 *   node scripts/seed-operator-accounts.mjs
 *
 * ACCOUNTS:
 *   Admin      admin@blinkgo.com         BlinkGoAdmin2026!
 *   Driver     driver@blinkgo.com         BlinkGoDriver2026!
 *   Restaurant wesseling@blinkgo.de       BlinkGoWesseling2026!
 *
 * SCHEMA NOTES (v85 — production-compatible):
 *   - public.users.role is an ENUM `user_role` with values
 *     ('customer', 'driver', 'restaurant', 'admin').
 *     We use 'restaurant' for the restaurant operator (NOT 'restaurant_owner').
 *   - public.restaurants has NO `slug` column. Image is `image_url` or
 *     `cover_url`. `cuisine` is TEXT (NOT array). `delivery_time` is INT
 *     (NOT text). `min_order` (NOT `min_order_amount`).
 *   - public.drivers.id references public.users.id, so we use the SAME
 *     UUID for the drivers row as the users row.
 *
 * SECURITY: this script REQUIRES the service-role key. It must NEVER
 * be called from the browser or from any client code path.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[seed] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  console.error('Usage:');
  console.error('  SUPABASE_URL=https://xxx.supabase.co \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \\');
  console.error('  node scripts/seed-operator-accounts.mjs');
  process.exit(1);
}

// Operators with stable UUIDs so the SQL seed migration can reference them.
// role strings MUST be valid user_role ENUM values:
//   'customer' | 'driver' | 'restaurant' | 'admin'
const OPERATORS = [
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'admin@blinkgo.com',
    password: 'BlinkGoAdmin2026!',
    name: 'BlinkGo Admin',
    role: 'admin',
  },
  {
    id: '62e81b22-06f3-4217-adad-8839c29d64ff',
    email: 'driver@blinkgo.com',
    password: 'BlinkGoDriver2026!',
    name: 'BlinkGo Driver',
    role: 'driver',
  },
  {
    id: '00000000-0000-0000-0000-000000000020',
    email: 'wesseling@blinkgo.de',
    password: 'BlinkGoWesseling2026!',
    name: 'Wesseling Restaurant',
    role: 'restaurant',
  },
];

/**
 * Custom fetch wrapper for the new `sb_secret_*` service-role key format.
 *
 * PostgREST (`/rest/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1`)
 * accepts `apikey: <key>` but rejects `Authorization: Bearer <new-secret>`
 * with "unrecognized JWT kid <nil> for algorithm ES256".
 *
 * GoTrue (`/auth/v1`) REQUIRES `Authorization: Bearer <key>` for admin
 * endpoints, otherwise it returns 401.
 *
 * Strategy: strip Authorization for PostgREST, keep it for GoTrue.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: makeServiceFetch(SUPABASE_SERVICE_ROLE_KEY) },
});

/**
 * Wait for a GoTrue read-after-write to settle. The GoTrue read-replica
 * can return 404 for a freshly-created user for a few hundred ms. We
 * retry up to 8 times with exponential backoff before giving up.
 */
async function waitForAuthUser(email, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (!error && data?.users) {
      const found = data.users.find((u) => u.email === email);
      if (found) return found;
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

async function seedOperator({ id, email, password, name, role }) {
  console.log(`[seed] ${email} (${role})...`);

  // 1. Ensure the auth.users row exists with the right password + verified email
  let existing = await waitForAuthUser(email, 4); // 4 attempts before we even try to create
  if (existing) {
    console.log(`  • auth user exists (id: ${existing.id}), updating...`);
    if (existing.id !== id) {
      console.warn(`  ⚠  existing user id (${existing.id}) differs from canonical (${id})`);
      console.warn(`     using existing id to avoid duplicate-email issues`);
      id = existing.id;
    }
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (updateErr) {
      console.error(`  ❌ updateUserById failed: ${updateErr.message}`);
      return { ok: false, id };
    }
  } else {
    console.log(`  • creating auth user...`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      id,
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (createErr) {
      // Common case: soft-deleted auth.users row blocks the email uniqueness.
      // The Admin API filters out deleted rows, so listUsers() doesn't see them.
      // Pivot: use a direct SQL cleanup or use the existing canonical UUID.
      if (createErr.message?.toLowerCase().includes('already') ||
          createErr.status === 422 || createErr.status === 400) {
        console.warn(`  ⚠  email already exists (possibly soft-deleted). Re-checking...`);
        existing = await waitForAuthUser(email, 6);
        if (existing) {
          id = existing.id;
          const { error: updateErr2 } = await supabase.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: { name, role },
          });
          if (updateErr2) {
            console.error(`  ❌ updateUserById (after recovery) failed: ${updateErr2.message}`);
            return { ok: false, id };
          }
        } else {
          console.error(`  ❌ email registered but not visible to Admin API (soft-deleted).`);
          console.error(`     Run: DELETE FROM auth.users WHERE email = '${email}' in SQL editor.`);
          return { ok: false, id };
        }
      } else {
        console.error(`  ❌ createUser failed: ${createErr.message}`);
        return { ok: false, id };
      }
    } else {
      console.log(`  • created (id: ${created.user.id})`);
      id = created.user.id;
    }
  }

  // 2. Sync to public.users (only columns that exist in production)
  //    We use ONLY the production-schema columns. No is_verified, no
  //    auth_provider, no last_login_at — wait, those DO exist (added
  //    by migration 32 and 00-auth-sync). Use them.
  const { error: upsertErr } = await supabase
    .from('users')
    .upsert(
      {
        id,
        email,
        name,
        role,                            // matches user_role ENUM
        is_active: true,
        is_verified: true,
        auth_provider: 'email',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (upsertErr) {
    console.error(`  ❌ public.users upsert failed: ${upsertErr.message}`);
    return { ok: false, id };
  }
  console.log(`  ✅ seeded (id: ${id}, role: ${role})`);

  // 3. For the driver, also create the public.drivers row
  if (role === 'driver') {
    const { error: drvErr } = await supabase
      .from('drivers')
      .upsert(
        {
          id,                              // drivers.id = users.id
          user_id: id,
          vehicle_type: 'bike',
          is_online: false,
          is_available: true,
          is_approved: true,
          status: 'active',
          documents_verified: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    if (drvErr) {
      console.error(`  ❌ public.drivers upsert failed: ${drvErr.message}`);
    } else {
      console.log(`  ✅ driver profile seeded`);
    }
  }

  return { ok: true, id };
}

async function seedWesselingRestaurant(ownerId) {
  console.log(`[seed] Wesseling restaurant row...`);
  // Uses ONLY production-schema columns
  const { error: restErr } = await supabase
    .from('restaurants')
    .upsert(
      {
        id: '00000000-0000-0000-0000-000000000020',
        owner_id: ownerId,
        name: 'Wesseling Restaurant',
        name_ar: 'مطعم فسيلينغ',
        description: 'Authentische Küche direkt aus Wesseling — frisch, schnell, zuverlässig.',
        description_ar: 'مأكولات أصيلة من فسيلينغ — طازجة وسريعة وموثوقة.',
        category: 'restaurant',
        cuisine: 'Deutsch,Pizza,Burger',
        rating: 4.7,
        total_reviews: 0,
        delivery_time: 30,
        delivery_fee: 2.99,
        min_order: 10.00,
        min_order_amount: 10.00,
        address: 'Wesseling, Deutschland',
        city: 'Wesseling',
        latitude: 50.8208,
        longitude: 6.9786,
        opening_hours: {
          monday:    { open: '09:00', close: '22:00', closed: false },
          tuesday:   { open: '09:00', close: '22:00', closed: false },
          wednesday: { open: '09:00', close: '22:00', closed: false },
          thursday:  { open: '09:00', close: '22:00', closed: false },
          friday:    { open: '09:00', close: '23:00', closed: false },
          saturday:  { open: '10:00', close: '23:00', closed: false },
          sunday:    { open: '11:00', close: '22:00', closed: false },
        },
        is_active: true,
        is_featured: true,
        type: 'restaurant',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (restErr) {
    console.error(`  ❌ public.restaurants upsert failed: ${restErr.message}`);
    return false;
  }
  console.log(`  ✅ restaurant row seeded`);
  return true;
}

async function main() {
  console.log('[seed] Operator account seeder starting...\n');
  let okCount = 0;
  let restaurantOwnerId = null;
  for (const op of OPERATORS) {
    const r = await seedOperator(op);
    if (r.ok) {
      okCount++;
      if (op.role === 'restaurant') restaurantOwnerId = r.id;
    }
    console.log('');
  }
  if (restaurantOwnerId) {
    await seedWesselingRestaurant(restaurantOwnerId);
  }
  console.log(`[seed] Done. ${okCount}/${OPERATORS.length} operators seeded successfully.`);
  process.exit(okCount === OPERATORS.length ? 0 : 1);
}

main().catch((err) => {
  console.error('[seed] Fatal:', err);
  process.exit(1);
});
