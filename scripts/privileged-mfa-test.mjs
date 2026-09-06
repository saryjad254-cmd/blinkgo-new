import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isPrivilegedMfaEnforced, safeAdminRedirect } from '../lib/auth/privileged-mfa.ts';

const original = { nodeEnv: process.env.NODE_ENV, enforce: process.env.ENFORCE_ADMIN_MFA, disable: process.env.DISABLE_ADMIN_MFA };
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`PASS ${name}`); };

try {
  check('local development keeps the demo harness usable by default', () => {
    process.env.NODE_ENV = 'development'; delete process.env.ENFORCE_ADMIN_MFA; delete process.env.DISABLE_ADMIN_MFA;
    assert.equal(isPrivilegedMfaEnforced(), false);
  });
  check('integration QA can opt into MFA outside production', () => {
    process.env.ENFORCE_ADMIN_MFA = 'true';
    assert.equal(isPrivilegedMfaEnforced(), true);
  });
  check('production enforces privileged MFA by default', () => {
    process.env.NODE_ENV = 'production'; delete process.env.ENFORCE_ADMIN_MFA;
    assert.equal(isPrivilegedMfaEnforced(), true);
  });
  check('an explicit emergency switch can disable the gate', () => {
    process.env.DISABLE_ADMIN_MFA = 'true';
    assert.equal(isPrivilegedMfaEnforced(), false);
  });
  check('post-verification redirects cannot leave the admin portal', () => {
    assert.equal(safeAdminRedirect('/admin/finance?period=month'), '/admin/finance?period=month');
    for (const unsafe of ['https://evil.example', '//evil.example', '/driver', null]) assert.equal(safeAdminRedirect(unsafe), '/admin');
  });

  const root = process.cwd();
  const [proxy, client] = await Promise.all([
    readFile(path.join(root, 'proxy.ts'), 'utf8'),
    readFile(path.join(root, 'app/auth/mfa/MfaClient.tsx'), 'utf8'),
  ]);
  check('all admin pages and APIs pass through the centralized AAL2 gate', () => {
    assert.match(proxy, /path\.startsWith\('\/api\/admin\/'\)/);
    assert.match(proxy, /app_metadata\?\.app_role/);
    assert.doesNotMatch(proxy, /app_metadata\?\.role/);
    assert.match(proxy, /getPrivilegedMfaState\(supabase\)/);
    assert.match(proxy, /MFA_REQUIRED/);
  });
  check('the UI supports enrollment, challenge, verification and one-time-code input', () => {
    for (const contract of ['mfa.enroll', 'mfa.listFactors', 'mfa.challenge', 'mfa.verify', 'one-time-code']) assert.ok(client.includes(contract));
  });
} finally {
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.nodeEnv;
  if (original.enforce === undefined) delete process.env.ENFORCE_ADMIN_MFA; else process.env.ENFORCE_ADMIN_MFA = original.enforce;
  if (original.disable === undefined) delete process.env.DISABLE_ADMIN_MFA; else process.env.DISABLE_ADMIN_MFA = original.disable;
}

console.log(`Privileged MFA: ${passed}/${passed} checks passed.`);
