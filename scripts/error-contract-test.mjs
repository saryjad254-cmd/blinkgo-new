import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { extractErrorMessage } from '../lib/foundation/error-helper.ts';

const cases = [
  [{ error: { code: 'FORBIDDEN', message: 'Missing payment_support permission', statusCode: 403 } }, 'Fallback', 'Missing payment_support permission'],
  [{ error: { code: 'RATE_LIMITED' } }, 'Fallback', 'Too many attempts. Please try again later.'],
  [{ error: 'ORDER_NOT_FOUND' }, 'Fallback', 'Order not found'],
  [{ message: 'Network unavailable' }, 'Fallback', 'Network unavailable'],
  [new Error('Connection timed out'), 'Fallback', 'Connection timed out'],
  [{ error: { details: { message: 'Validation detail' } } }, 'Fallback', 'Validation detail'],
  [{ error: {} }, 'Localized fallback', 'Localized fallback'],
  [null, 'Localized fallback', 'Localized fallback'],
];

for (const [input, fallback, expected] of cases) {
  assert.equal(extractErrorMessage(input, fallback), expected);
}

const roots = ['app', 'components'];
const unsafe = [];
const patterns = [
  /new Error\([^\n]*(?:payload|result|data|json)\??\.error\s*(?:\|\||\?\?)/g,
  /(?:setError|setCreateError|setMessage|toast\.error|alert)\([^\n]*(?:payload|result|data|json)\??\.error\s*(?:\|\||\?\?)/g,
];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(source)) unsafe.push(file);
      }
    }
  }
}

roots.forEach(visit);
assert.deepEqual([...new Set(unsafe)], [], `Unsafe direct API error rendering found in: ${[...new Set(unsafe)].join(', ')}`);

console.log(`error contract: ${cases.length}/${cases.length} runtime cases passed; source guard passed`);
