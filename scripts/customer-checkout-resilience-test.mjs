import { readFileSync } from 'node:fs';

const cart = readFileSync('app/(customer)/cart/page.tsx', 'utf8');
const checkout = readFileSync('app/(customer)/checkout/page.tsx', 'utf8');
const draftRoute = readFileSync('app/api/checkout/draft/route.ts', 'utf8');

const checks = [
  ['cart restores the persisted verified delivery address', cart.includes('storedAddress = useCart') && cart.includes('didRestoreAddressRef') && cart.includes('setAddressVerified(Number.isFinite')],
  ['cart does not reject valid zero-valued coordinates by truthiness', cart.includes('addressLat == null || addressLng == null || !addressVerified') && !cart.includes('(!addressLat || !addressLng)')],
  ['cart exposes an accessible retry after quote failure', cart.includes('quoteError && (') && cart.includes('Retry cart check') && cart.includes('void fetchQuote()')],
  ['cart pricing requests abort superseded work', cart.includes('quoteRequestSequenceRef') && cart.includes('quoteAbortRef.current?.abort()') && cart.includes('requestSequence !== quoteRequestSequenceRef.current')],
  ['cart network failure leaves a recoverable error instead of endless checking', cart.includes('setQuoteError(t.errors?.networkError') && cart.includes('setQuote(null)')],
  ['checkout draft requests abort superseded work', checkout.includes('draftRequestSequenceRef') && checkout.includes('draftAbortRef.current?.abort()') && checkout.includes('requestSequence !== draftRequestSequenceRef.current')],
  ['checkout only clears loading for the latest draft request', checkout.includes('requestSequence === draftRequestSequenceRef.current) setDraftLoading(false)')],
  ['checkout sends a durable idempotency key with every draft request', checkout.includes("'X-Idempotency-Key': idempotencyKey")],
  ['checkout draft route claims idempotency after validating the payload', draftRoute.includes('return withIdempotency(') && draftRoute.includes('{ fingerprint: validated.data }')],
  ['checkout reuses a key only while the serialized draft payload is unchanged', checkout.includes("draftIdempotencyRef.current?.payload !== serializedBody") && checkout.includes("{ payload: serializedBody, key: crypto.randomUUID() }")],
  ['checkout safely retries while an identical draft request is still processing', checkout.includes("errorCode !== 'IDEMPOTENCY_IN_PROGRESS'") && checkout.includes('attempt < 3')],
  ['cart and checkout cancel requests during unmount', cart.includes("useEffect(() => () => quoteAbortRef.current?.abort(), [])") && checkout.includes("useEffect(() => () => draftAbortRef.current?.abort(), [])")],
];

let failures = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  if (!passed) failures += 1;
}

console.log(`\nCustomer checkout resilience: ${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exitCode = 1;
