import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260811091450_merchant_trader_verification.sql'), 'utf8');
check(migration.includes('restaurant_verifications') && migration.includes('enable row level security') && migration.includes('revoke all'), 'Trader evidence is stored in a service-only RLS table');
check(migration.includes("'draft', 'pending', 'approved', 'rejected', 'suspended'") && migration.includes('self_certified_at'), 'Verification lifecycle and legal self-certification are persisted');

const createRoute = fs.readFileSync(path.join(root, 'app/api/admin/restaurants/route.ts'), 'utf8');
const invitationService = fs.readFileSync(path.join(root, 'lib/auth/admin-invitations.ts'), 'utf8');
check(createRoute.includes("inviteAuthUser") && createRoute.includes("role: 'restaurant'") && invitationService.includes('app_metadata: { app_role: role }') && !invitationService.match(/user_metadata:\s*\{[^}]*role/), 'Role is assigned in protected app metadata, not editable user metadata');
check(createRoute.includes('is_verified: false') && createRoute.includes('is_active: false') && createRoute.includes("verification_status: 'pending'"), 'New merchants remain unverified and unpublished pending review');
check(createRoute.includes('identity_document_ref') && createRoute.includes('business_document_ref') && createRoute.includes('payout_account_last4'), 'Identity, register, and payout evidence are mandatory');

const activationRoute = fs.readFileSync(path.join(root, 'app/api/admin/restaurants/[id]/route.ts'), 'utf8');
check(activationRoute.includes("verification?.status !== 'approved'") && activationRoute.includes('status: 409'), 'Server blocks restaurant activation without approval');

const reviewRoute = fs.readFileSync(path.join(root, 'app/api/admin/restaurants/[id]/verification/route.ts'), 'utf8');
check(reviewRoute.includes("action === 'approve'") && reviewRoute.includes("action === 'reject'") && reviewRoute.includes('recordAudit'), 'Admin approval and rejection are audited server-side');

const onboarding = fs.readFileSync(path.join(root, 'components/admin/AdminOnboardingClient.tsx'), 'utf8');
check(onboarding.includes('merchant-verification') && onboarding.includes('self_certified') && onboarding.includes('trade_register_number'), 'Admin onboarding exposes complete trader verification fields');

const restaurantAdmin = fs.readFileSync(path.join(root, 'components/admin/AdminRestaurantsClient.tsx'), 'utf8');
check(restaurantAdmin.includes('Verify & publish') && restaurantAdmin.includes('توثيق ونشر') && restaurantAdmin.includes('reviewVerification'), 'Admin UI shows multilingual verify, publish, and reject controls');

console.log(`Merchant verification: PASS (${passed}/${passed})`);
