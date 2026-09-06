import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFinanceReconciliation } from '../lib/finance/reconciliation';
import { buildDriverPayoutJournalLines, buildMerchantPayoutJournalLines, buildOrderJournalLines, buildRefundJournalLines } from '../lib/finance/ledger';

let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

const baseOrder = {
  id: 'order-1', order_number: 'BG-1', restaurant_id: 'restaurant-1', driver_id: 'driver-1',
  subtotal: 20, delivery_fee: 4, service_fee: 1, tip: 2, discount: 0, total: 27,
  status: 'delivered', payment_status: 'succeeded', payment_method: 'stripe', created_at: new Date().toISOString(),
};

const normal = buildFinanceReconciliation([baseOrder], [], []);
check('uses integer cents for gross sales', () => assert.equal(normal.gross_sales_cents, 2700));
check('calculates restaurant payable after 15% commission', () => assert.equal(normal.restaurant_payable_cents, 1700));
check('passes the 80% delivery share plus tip through', () => assert.equal(normal.driver_payable_cents, 520));
check('balances every allocation exactly', () => assert.equal(normal.mismatch_cents, 0));
check('does not flag a succeeded card payment', () => assert.equal(normal.exceptions.length, 0));

const refunded = buildFinanceReconciliation(
  [baseOrder],
  [{ order_id: 'order-1', status: 'succeeded', refunded_amount_cents: 2700 }],
  [],
);
check('deducts successful refunds from collected funds', () => assert.equal(refunded.net_collected_cents, 0));
check('removes merchant obligation on full refund', () => assert.equal(refunded.restaurant_payable_cents, 0));
check('keeps completed courier compensation after post-delivery refund', () => assert.equal(refunded.driver_payable_cents, 520));
check('still balances a fully refunded delivered order', () => assert.equal(refunded.mismatch_cents, 0));

const payout = buildFinanceReconciliation([baseOrder], [], [{ status: 'paid', net_payout: 2.5 }]);
check('subtracts paid driver payouts from outstanding amount', () => assert.equal(payout.driver_outstanding_cents, 270));

const suspicious = buildFinanceReconciliation([{ ...baseOrder, payment_status: 'pending' }], [], []);
check('surfaces unconfirmed card payments', () => assert.equal(suspicious.exceptions[0]?.code, 'unconfirmed_payment'));

const migration = readFileSync(new URL('../supabase/migrations/20260814133000_add_financial_ledger_and_reconciliation.sql', import.meta.url), 'utf8');
check('database rejects unbalanced journals', () => assert.match(migration, /unbalanced_financial_journal/));
check('ledger is append-only', () => assert.match(migration, /financial_ledger_is_append_only/));
check('ledger access is denied to browser roles', () => assert.match(migration, /revoke all on public\.financial_journals, public\.financial_ledger_entries from anon, authenticated/));

const journal = buildOrderJournalLines(baseOrder);
check('order journal debits equal credits', () => assert.equal(journal.reduce((sum, line) => sum + line.debit_cents, 0), journal.reduce((sum, line) => sum + line.credit_cents, 0)));
check('order journal separates merchant, driver, commission and service fee', () => assert.deepEqual(new Set(journal.map((line) => line.account_code)), new Set(['cash_stripe', 'merchant_payable', 'driver_payable', 'platform_commission_revenue', 'service_fee_revenue', 'delivery_fee_revenue'])));
const subsidizedJournal = buildOrderJournalLines({ ...baseOrder, delivery_fee: 0, total: 23 });
check('courier minimum above delivery fee becomes explicit subsidy expense', () => assert.ok(subsidizedJournal.some((line) => line.account_code === 'promotions_expense' && line.debit_cents > 0)));
check('cash orders post to COD cash instead of Stripe cash', () => assert.equal(buildOrderJournalLines({ ...baseOrder, payment_method: 'cash', payment_status: 'paid' })[0].account_code, 'cash_cod'));
check('uncollected cash orders remain a receivable', () => assert.equal(buildOrderJournalLines({ ...baseOrder, payment_method: 'cash', payment_status: 'pending' })[0].account_code, 'customer_receivable'));
const payoutJournal = buildDriverPayoutJournalLines({ driver_id: '00000000-0000-4000-8000-000000000001', net_payout: 123.45 });
check('driver payout journal clears payable against bank cash', () => assert.deepEqual(payoutJournal.map((line) => [line.account_code, line.debit_cents, line.credit_cents]), [['driver_payable', 12345, 0], ['cash_bank', 0, 12345]]));
const refundJournal = buildRefundJournalLines(baseOrder, 2700);
check('refund journal balances the exact refunded cents', () => assert.equal(refundJournal.reduce((sum, line) => sum + line.debit_cents, 0), refundJournal.reduce((sum, line) => sum + line.credit_cents, 0)));
check('refund journal protects completed courier compensation', () => assert.equal(refundJournal.some((line) => line.account_code === 'driver_payable'), false));
check('refund journal records the customer cash outflow', () => assert.deepEqual(refundJournal.at(-1), { account_code: 'cash_stripe', debit_cents: 0, credit_cents: 2700, memo: 'Customer refund paid' }));
const merchantPayoutJournal = buildMerchantPayoutJournalLines({ restaurant_id: '00000000-0000-4000-8000-000000000002', net_payout_cents: 1700 });
check('merchant payout journal clears payable against bank cash', () => assert.deepEqual(merchantPayoutJournal.map((line) => [line.account_code, line.debit_cents, line.credit_cents]), [['merchant_payable', 1700, 0], ['cash_bank', 0, 1700]]));
const withMerchantPayment = buildFinanceReconciliation([baseOrder], [], [], [{ status: 'paid', net_payout_cents: 1000 }]);
check('paid merchant settlements reduce outstanding payable', () => assert.equal(withMerchantPayment.restaurant_outstanding_cents, 700));

console.log(`\nFinance reconciliation: ${passed}/${passed} checks passed`);
