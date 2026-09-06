import fs from 'node:fs';

const files = {
  migration: fs.readFileSync('supabase/migrations/20260812101939_product_legal_information.sql', 'utf8'),
  action: fs.readFileSync('lib/restaurant-actions.ts', 'utf8'),
  form: fs.readFileSync('components/restaurant/ProductForm.tsx', 'utf8'),
  modal: fs.readFileSync('components/customer/ProductDetailModal.tsx', 'utf8'),
  quote: fs.readFileSync('app/api/cart/quote/route.ts', 'utf8'),
  draft: fs.readFileSync('app/api/checkout/draft/route.ts', 'utf8'),
};

const checks = [
  ['database has explicit allergen review', files.migration.includes('allergen_information_reviewed boolean not null default false')],
  ['database derives legal completeness', files.migration.includes('compute_product_legal_completeness') && files.migration.includes('trg_products_legal_information')],
  ['database derives unit price', files.migration.includes('new.base_price := round')],
  ['merchant validates packaged food', files.action.includes("value.product_kind === 'prepacked_food'")],
  ['merchant validates alcohol', files.action.includes("value.product_kind === 'alcohol'")],
  ['merchant UI exposes product type', files.form.includes('data-testid="product-kind"')],
  ['merchant UI exposes nutrition', files.form.includes("'energy_kj'") && files.form.includes("'salt_g'")],
  ['customer sees legal information', files.modal.includes('data-testid="customer-product-legal-information"')],
  ['cart quote blocks incomplete regulated catalog data', files.quote.includes("kind: 'legal_information_incomplete'")],
  ['checkout draft independently blocks incomplete data', files.draft.includes("LEGAL_INFORMATION_INCOMPLETE: 'legal_information_incomplete'")],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) failed += 1;
}
if (failed) process.exit(1);
console.log(`Product legal information contract: PASS (${checks.length}/${checks.length})`);
