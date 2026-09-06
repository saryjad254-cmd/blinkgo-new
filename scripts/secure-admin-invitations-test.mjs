import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const [helper, driverApi, restaurantApi, adminApi, onboarding, driversUi, restaurantsUi, adminsUi, acceptance, mock] = await Promise.all([
  read('lib/auth/admin-invitations.ts'),
  read('app/api/admin/drivers/route.ts'),
  read('app/api/admin/restaurants/route.ts'),
  read('app/api/admin/admins/route.ts'),
  read('components/admin/AdminOnboardingClient.tsx'),
  read('app/admin/drivers/AdminDriversClient.tsx'),
  read('app/admin/restaurants/AdminRestaurantsClient.tsx'),
  read('app/admin/admins/AdminAdminsClient.tsx'),
  read('app/auth/accept-invite/AcceptInviteClient.tsx'),
  read('scripts/mock-supabase.mjs'),
]);

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`); };

check('admin creation uses Supabase one-time invitations', () => {
  assert.match(helper, /inviteUserByEmail/);
  assert.match(helper, /redirectTo/);
  assert.match(helper, /\/auth\/accept-invite/);
});

check('authorization role is assigned in trusted app_metadata', () => {
  assert.match(helper, /updateUserById/);
  assert.match(helper, /app_metadata:\s*\{\s*app_role:\s*role/);
});

check('driver, restaurant and admin APIs never accept or create shared passwords', () => {
  for (const source of [driverApi, restaurantApi, adminApi]) {
    assert.doesNotMatch(source, /createUser\s*\(/);
    assert.doesNotMatch(source, /body\.(?:password|owner_password)/);
    assert.match(source, /activation:\s*'invite_sent'/);
  }
});

check('all admin creation forms removed password inputs', () => {
  for (const source of [onboarding, driversUi, restaurantsUi, adminsUi]) {
    assert.doesNotMatch(source, /type="password"/);
  }
});

check('invited user chooses a strong personal password', () => {
  assert.match(acceptance, /updateUser\(\{ password \}\)/);
  assert.match(acceptance, /value\.length >= 12/);
  assert.match(acceptance, /autoComplete="new-password"/);
  assert.match(acceptance, /signOut\(\{ scope: 'local' \}\)/);
});

check('mock Supabase faithfully supports pending invitations and app_metadata', () => {
  assert.match(mock, /path === '\/auth\/v1\/invite'/);
  assert.match(mock, /password: null/);
  assert.match(mock, /body\.app_metadata\.app_role/);
});

console.log(`Secure admin invitations: ${passed}/${passed} checks passed.`);
