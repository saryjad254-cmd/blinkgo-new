import assert from 'node:assert/strict';
import fs from 'node:fs';

const exposureSql = fs.readFileSync(
  new URL('../supabase/migrations/20260831124921_remove_legacy_public_data_exposure.sql', import.meta.url),
  'utf8',
);
const ratingsSql = fs.readFileSync(
  new URL('../supabase/migrations/20260831125502_restrict_rating_participant_data.sql', import.meta.url),
  'utf8',
);
const ratingsRoute = fs.readFileSync(new URL('../app/api/ratings/route.ts', import.meta.url), 'utf8');

for (const table of ['drivers', 'share_links', 'badges', 'config', 'system_settings']) {
  assert.match(exposureSql, new RegExp(`revoke all on table public\\.${table} from anon`, 'i'));
}
assert.match(exposureSql, /drop policy if exists drivers_public_read/i);
assert.match(exposureSql, /created_by = \(select auth\.uid\(\)\)/i);
assert.doesNotMatch(exposureSql, /grant[^;]*insert[^;]*public\.badges[^;]*authenticated/i);
assert.match(exposureSql, /create policy config_public_read[\s\S]*key in/i);
assert.match(exposureSql, /create policy system_settings_public_read[\s\S]*key in/i);

assert.match(ratingsSql, /revoke all on table public\.ratings from anon/i);
assert.match(ratingsSql, /drop policy if exists "Public can read ratings"/i);
assert.match(ratingsSql, /customer_id = \(select auth\.uid\(\)\)/i);
assert.match(ratingsSql, /rated_restaurant\.owner_id = \(select auth\.uid\(\)\)/i);

const publicGet = ratingsRoute.slice(ratingsRoute.indexOf('export async function GET'));
assert.match(publicGet, /restaurant_id required/);
assert.match(publicGet, /select\('id,restaurant_rating,food_rating,comment,created_at,customer:customer_id\(name,avatar_url\)'\)/);
assert.doesNotMatch(publicGet, /select\('\*|driver_id = searchParams/);

console.log('Legacy public data exposure: PASS (drivers, share tokens, config, badges, ratings)');
