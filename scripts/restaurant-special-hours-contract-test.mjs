#!/usr/bin/env node

import fs from 'node:fs';

let passed = 0;
function test(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const migration = fs.readFileSync('supabase/migrations/20260812082504_restaurant_special_hours.sql', 'utf8');
const route = fs.readFileSync('app/api/restaurant/special-hours/route.ts', 'utf8');
const restaurantContext = fs.readFileSync('lib/services/restaurant-context.ts', 'utf8');
const form = fs.readFileSync('components/restaurant/SpecialHoursForm.tsx', 'utf8');
const checkout = fs.readFileSync('app/api/checkout/draft/route.ts', 'utf8');
const settings = fs.readFileSync('app/restaurant/settings/page.tsx', 'utf8');

test(migration.includes('enable row level security'), 'Special-hours table has RLS enabled');
test(!migration.includes('to anon, authenticated') && migration.includes('restaurant_special_hours_owner_read'), 'Direct special-hours reads are limited to the venue owner');
test(migration.includes('restaurant.owner_id = (select auth.uid())'), 'Write policies are restricted to the restaurant owner');
test(migration.includes('unique (restaurant_id, service_date)'), 'Only one override can exist for a restaurant and date');
test(migration.includes('restaurant_special_hours_times check'), 'Database enforces closed versus open-time consistency');
test(route.includes("roles: ['restaurant']"), 'API requires the restaurant role');
test(
  route.includes('resolveOwnedRestaurant(userId)')
    && restaurantContext.includes(".eq('owner_id', userId)"),
  'API resolves the authenticated owner restaurant server-side',
);
test(route.includes(".eq('restaurant_id', restaurantId)"), 'Delete and list operations are scoped to the owned restaurant');
test(form.includes('data-testid="special-hours-save"'), 'Merchant settings expose a working save control');
test(form.includes("method: 'DELETE'"), 'Merchant can remove an obsolete override');
test(settings.includes('<SpecialHoursForm'), 'Special-hours management is mounted in restaurant settings');
test(checkout.includes(".from('restaurant_special_hours')") && checkout.includes('isRestaurantOpenAt('), 'Checkout enforces date-specific hours before payment');

console.log(`Restaurant special-hours contract: PASS (${passed}/${passed})`);
