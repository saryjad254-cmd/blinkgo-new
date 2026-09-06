import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/admin/delay-policy.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(`(function(module,exports){${code}\n})`, {}, { filename: 'lib/admin/delay-policy.ts' })(compiledModule, compiledModule.exports);
const policy = compiledModule.exports;

let passed = 0;
function ok(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

const defaults = policy.normalizeDelayReviewPolicy(null);
ok(defaults.reviewAfterMinutes === 20 && defaults.criticalAfterMinutes === 35, 'Missing configuration uses conservative review thresholds');
ok(policy.recommendedDelayCreditCents(19, defaults) === null, 'Short waits never produce a credit recommendation');
ok(policy.recommendedDelayCreditCents(20, defaults) === 150, 'Threshold wait produces the configured base recommendation');
ok(policy.recommendedDelayCreditCents(100, defaults) === 500, 'Recommendation is capped by the configured maximum');
ok(policy.delaySeverity(35, null, defaults) === 'critical', 'Critical wait threshold is enforced');
ok(policy.delaySeverity(0, 'unsafe_situation', defaults) === 'critical', 'Safety reports are always critical');
const bounded = policy.normalizeDelayReviewPolicy({ reviewAfterMinutes: -50, criticalAfterMinutes: 1, baseCreditCents: -5, maxCreditCents: 999999 });
ok(bounded.reviewAfterMinutes === 5 && bounded.criticalAfterMinutes === 10, 'Invalid minute thresholds are safely bounded');
ok(bounded.baseCreditCents === 0 && bounded.maxCreditCents === 20000, 'Financial settings are safely bounded');
const disabled = policy.normalizeDelayReviewPolicy({ enabled: false });
ok(policy.recommendedDelayCreditCents(999, disabled) === null, 'Disabled policy never creates recommendations');

console.log(`Admin delay policy: PASS (${passed}/${passed})`);
