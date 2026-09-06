import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../supabase/migrations/20260831122957_enforce_principal_role_boundaries.sql', import.meta.url),
  'utf8',
);

assert.match(sql, /revoke all on table public\.driver_status from anon/i);
assert.match(sql, /driver_id = \(select auth\.uid\(\)\)[\s\S]*auth_role\(\)\) = 'driver'/i);
assert.match(sql, /owning_restaurant\.owner_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /active_order\.status in \('confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering'\)/i);

assert.match(sql, /revoke all on table public\.restaurants from anon/i);
assert.match(sql, /create policy restaurants_owner_insert[\s\S]*auth_role\(\)\) = 'restaurant'/i);
assert.match(sql, /create policy restaurants_owner_update[\s\S]*auth_role\(\)\) = 'restaurant'/i);
assert.doesNotMatch(sql, /grant[^;]*delete[^;]*public\.restaurants[^;]*authenticated/i);

console.log('Principal role boundaries: PASS (driver presence + restaurant ownership)');
