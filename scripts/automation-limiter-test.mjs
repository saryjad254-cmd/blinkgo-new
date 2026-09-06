import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/integrations/automation/execution-limiter.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Map, Date });
const { AutomationExecutionLimiter } = compiledModule.exports;

let passed = 0;
const checks = [];
function check(name, condition) {
  checks.push({ name, condition });
  if (condition) passed += 1;
}

const limiter = new AutomationExecutionLimiter();
const start = Date.UTC(2026, 7, 11, 10, 0, 0);
check('first execution is allowed', limiter.canExecute('rule-a', 1, 10, start));
limiter.record('rule-a', start);
check('hourly limit blocks the second execution', !limiter.canExecute('rule-a', 1, 0, start + 1_000));
check('cooldown blocks execution below its window', !limiter.canExecute('rule-a', 10, 10, start + 9 * 60_000));
check('cooldown allows execution at its boundary', limiter.canExecute('rule-a', 10, 10, start + 10 * 60_000));
check('expired hourly entries are pruned', limiter.canExecute('rule-a', 1, 0, start + 60 * 60_000 + 1));
check('future timestamps do not poison current checks', limiter.canExecute('rule-a', 1, 0, start - 1));

for (const item of checks) console.log(`${item.condition ? '✓' : '✗'} ${item.name}`);
if (passed !== checks.length) process.exit(1);
console.log(`Automation limiter: PASS (${passed}/${checks.length})`);
