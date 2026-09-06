import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const authHelper = fs.readFileSync(path.join(root, 'lib/auth-helper.ts'), 'utf8');
check(!authHelper.includes('user.user_metadata?.permissions') && !authHelper.includes('payload?.user_metadata?.permissions'), 'Authorization permissions never come from editable user metadata');
check(
  authHelper.includes('user.app_metadata?.permissions')
    && !authHelper.includes('payload?.app_metadata?.permissions')
    && authHelper.includes('supabase.auth.getUser(token)'),
  'Cookie and bearer paths use protected app metadata after signature verification',
);

const security = fs.readFileSync(path.join(root, 'lib/api/security.ts'), 'utf8');
check(security.includes('supabase.auth.getUser(token)') && !security.includes("Buffer.from(parts[1], 'base64url')"), 'Bearer tokens are signature-verified instead of locally trusted');
check(security.includes('bearerUser.app_metadata?.permissions') && !security.includes('user_metadata?.permissions'), 'Shared API security uses protected permission claims');

const creationFiles = [
  'app/api/admin/restaurants/route.ts',
  'app/api/admin/drivers/route.ts',
  'app/api/admin/admins/route.ts',
  'app/api/auth/register/route.ts',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
const invitationService = fs.readFileSync(path.join(root, 'lib/auth/admin-invitations.ts'), 'utf8');
check(
  creationFiles.every((source) => source.includes('app_metadata: { app_role') || source.includes('inviteAuthUser'))
    && invitationService.includes('app_metadata: { app_role: role }'),
  'All server-created accounts place roles in protected app metadata',
);
check([...creationFiles, invitationService].every((source) => !/user_metadata:\s*\{[^}]*role/.test(source)), 'No server-created account places authorization roles in editable metadata');

console.log(`Authorization sources: PASS (${passed}/${passed})`);
