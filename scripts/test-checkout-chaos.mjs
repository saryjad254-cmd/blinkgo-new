/**
 * Compatibility entrypoint.
 *
 * The former checkout chaos suite exercised a retired POST contract on
 * /api/checkout/confirm. Checkout creation now happens through the payment
 * flow and /api/checkout/confirm is deliberately read-only. Keep the old
 * filename for operators, but execute the current contract test.
 */
await import('./test-checkout-contract.mjs');
