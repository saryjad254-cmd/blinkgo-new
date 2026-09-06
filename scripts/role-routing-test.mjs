import assert from 'node:assert/strict';
import { getRoleHomePath } from '../lib/auth/role-routing.ts';

const expected = new Map([
  ['customer', '/home'],
  ['driver', '/driver/dashboard'],
  ['restaurant', '/restaurant/dashboard'],
  ['restaurant_owner', '/restaurant/dashboard'],
  ['manager', '/admin'],
  ['admin', '/admin'],
  ['super_admin', '/admin'],
  [undefined, '/home'],
  ['unknown', '/home'],
]);

for (const [role, path] of expected) {
  assert.equal(getRoleHomePath(role), path, `${String(role)} should route to ${path}`);
}

console.log(`Role routing: PASS (${expected.size} cases)`);
