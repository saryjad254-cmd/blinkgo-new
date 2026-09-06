import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/restaurant/preparation-policy.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {}, { filename: 'preparation-policy.ts' })(() => { throw new Error('Unexpected dependency'); }, compiledModule, compiledModule.exports);
const policy = compiledModule.exports;

const alertSource = fs.readFileSync(path.join(root, 'lib/restaurant/preparation-alerts.ts'), 'utf8');
const alertCode = ts.transpileModule(alertSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const alertModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${alertCode}\n})`, {}, { filename: 'preparation-alerts.ts' })((specifier) => {
  if (specifier === '@/lib/restaurant/preparation-policy') return policy;
  throw new Error(`Unexpected dependency: ${specifier}`);
}, alertModule, alertModule.exports);
const alerts = alertModule.exports;

let passed = 0;
function ok(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

ok(policy.normalizePreparationMinutes(undefined) === 20, 'Missing estimate uses the safe 20-minute default');
ok(policy.normalizePreparationMinutes(1) === 5 && policy.normalizePreparationMinutes(500) === 90, 'Estimate is bounded to 5–90 minutes');
const plan = policy.createPreparationPlan('2026-08-11T10:00:00.000Z', 15);
ok(plan.estimatedPrepMinutes === 15 && plan.estimatedReadyAt === '2026-08-11T10:15:00.000Z', 'Preparation deadline is deterministic');
ok(policy.preparationState('preparing', plan.estimatedReadyAt, Date.parse('2026-08-11T10:09:00.000Z')) === 'on_track', 'More than five minutes remaining is on track');
ok(policy.preparationState('preparing', plan.estimatedReadyAt, Date.parse('2026-08-11T10:12:00.000Z')) === 'warning', 'Approaching deadline raises a warning');
ok(policy.preparationState('preparing', plan.estimatedReadyAt, Date.parse('2026-08-11T10:16:00.000Z')) === 'late', 'Missed deadline is late');
ok(policy.preparationState('preparing', plan.estimatedReadyAt, Date.parse('2026-08-11T10:21:00.000Z')) === 'critical', 'Five minutes overdue is critical');
ok(policy.preparationState('ready', plan.estimatedReadyAt, Date.parse('2026-08-11T10:21:00.000Z')) === 'ready', 'Ready orders never remain in the late queue');
ok(policy.remainingPreparationMinutes(plan.estimatedReadyAt, Date.parse('2026-08-11T10:05:20.000Z')) === 10, 'Remaining time rounds up for kitchen safety');
const extracted = policy.extractPreparationPlan([{ metadata: {}, created_at: '2026-08-11T10:01:00.000Z' }, { metadata: { estimated_prep_minutes: 15, estimated_ready_at: plan.estimatedReadyAt }, created_at: '2026-08-11T10:00:00.000Z' }]);
ok(extracted?.estimatedPrepMinutes === 15, 'Latest usable plan survives later status events without metadata');

const alertOrder = { id: 'order-1', order_number: 'BG-1', status: 'preparing', restaurant_id: 'restaurant-1', customer_id: 'customer-1' };
const statusEvent = { order_id: 'order-1', event_type: 'status_change', metadata: { estimated_prep_minutes: 15, estimated_ready_at: plan.estimatedReadyAt }, created_at: '2026-08-11T10:00:00.000Z' };
const warningAlerts = alerts.planPreparationAlerts([alertOrder], [statusEvent], Date.parse('2026-08-11T10:12:00.000Z'));
ok(warningAlerts.length === 1 && warningAlerts[0].level === 'warning', 'Approaching deadline creates one proactive warning');
const sentWarning = { order_id: 'order-1', event_type: 'restaurant_prep_sla_alert', metadata: { alert_level: 'warning' }, created_at: '2026-08-11T10:12:00.000Z' };
ok(alerts.planPreparationAlerts([alertOrder], [statusEvent, sentWarning], Date.parse('2026-08-11T10:13:00.000Z')).length === 0, 'An alert level is never sent twice');
const criticalAlerts = alerts.planPreparationAlerts([alertOrder], [statusEvent, sentWarning], Date.parse('2026-08-11T10:21:00.000Z'));
ok(criticalAlerts.length === 1 && criticalAlerts[0].level === 'critical' && criticalAlerts[0].overdueMinutes === 6, 'Escalation to critical creates a new actionable alert');
ok(alerts.planPreparationAlerts([{ ...alertOrder, status: 'ready' }], [statusEvent], Date.parse('2026-08-11T10:21:00.000Z')).length === 0, 'Ready orders are excluded from proactive alerts');

console.log(`Restaurant preparation policy: PASS (${passed}/${passed})`);
