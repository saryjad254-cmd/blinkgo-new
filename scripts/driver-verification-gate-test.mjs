import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  ['create', 'app/api/admin/drivers/route.ts'],
  ['review', 'app/api/admin/drivers/[id]/documents/route.ts'],
  ['activate', 'app/api/admin/users/[id]/unsuspend/route.ts'],
  ['online', 'app/api/driver/online/route.ts'],
  ['accept', 'app/api/driver/orders/[id]/accept/route.ts'],
  ['admin', 'components/admin/AdminDriversClient.tsx'],
  ['migration', 'supabase/migrations/20260811093859_driver_verification_gate.sql'],
  ['verification', 'lib/driver/verification.ts'],
  ['storageMigration', 'supabase/migrations/20260811101810_driver_document_storage_hardening.sql'],
  ['lookupMigration', 'supabase/migrations/20260811105559_driver_social_insurance_lookup.sql'],
  ['driverDocuments', 'app/api/driver/documents/route.ts'],
].map(async ([key, path]) => [key, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')])));

const checks = [
  ['New drivers start unverified, inactive and pending', () => {
    assert.match(files.create, /is_active:\s*false/);
    assert.match(files.create, /is_verified:\s*false/);
    assert.match(files.create, /is_approved:\s*false/);
    assert.match(files.create, /status:\s*'pending'/);
  }],
  ['Activation requires all vehicle-specific documents', () => {
    assert.match(files.activate, /isDriverVerificationComplete/);
    assert.match(files.activate, /status:\s*409/);
  }],
  ['Going online requires verified and approved server state', () => {
    assert.match(files.online, /driver_verification_required/);
    assert.match(files.online, /!auth\.profile\.is_verified/);
    assert.match(files.online, /!driverProfile\?\.is_approved/);
  }],
  ['Order acceptance no longer trusts editable user metadata', () => {
    assert.doesNotMatch(files.accept, /user_metadata\?\.is_online/);
    assert.match(files.accept, /driver_status/);
    assert.match(files.accept, /is_approved/);
  }],
  ['Document decisions are audited and force a separate activation step', () => {
    assert.match(files.review, /driver\.document\.\$\{decision\}/);
    assert.match(files.review, /is_active:\s*false/);
    assert.match(files.review, /current_order_id:\s*null/);
  }],
  ['Admin UI exposes review progress and blocks premature activation', () => {
    assert.match(files.admin, /reviewDocument/);
    assert.match(files.admin, /approved_documents/);
    assert.match(files.admin, /!driver\.is_verified/);
  }],
  ['Migration removes legacy online state without approved evidence', () => {
    assert.match(files.migration, /COUNT\(DISTINCT dd\.document_type\)/);
    assert.match(files.migration, /SET is_online = false/);
    assert.match(files.migration, /status = 'pending'/);
  }],
  ['Employment and payroll evidence replaces background certificate', () => {
    assert.match(files.verification, /'employment_contract'/);
    assert.match(files.verification, /'health_insurance'/);
    assert.match(files.verification, /'tax_id_confirmation'/);
    assert.match(files.verification, /'social_insurance_number_proof'/);
    assert.match(files.verification, /'payout_account_verification'/);
    assert.doesNotMatch(files.verification, /required:[^;]*background_check/);
    assert.match(files.migration, /COUNT\(DISTINCT dd\.document_type\)/);
    assert.match(files.storageMigration, /driver_documents_document_type_check/);
  }],
  ['Unknown insurance numbers use an auditable payroll lookup flow', () => {
    assert.match(files.driverDocuments, /request_social_insurance_lookup/);
    assert.match(files.driverDocuments, /system:\/\/employer-insurance-number-lookup/);
    assert.match(files.driverDocuments, /safeDocument/);
    assert.match(files.review, /lookup_confirmed/);
    assert.match(files.lookupMigration, /submission_kind IN \('file', 'employer_lookup'\)/);
  }],
];

let passed = 0;
for (const [name, check] of checks) {
  check();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
console.log(`Driver verification gate: PASS (${passed}/${checks.length})`);
