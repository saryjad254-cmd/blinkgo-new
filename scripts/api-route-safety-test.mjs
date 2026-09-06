import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const apiRoot = join(root, 'app', 'api');

function filesUnder(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path));
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) files.push(path);
  }
  return files;
}

const failures = [];
for (const file of filesUnder(apiRoot)) {
  const source = readFileSync(file, 'utf8');
  if (/\(\s*\{\}\s+as\s+NextRequest\s*\)/.test(source)) {
    failures.push(`${relative(root, file)} passes a fabricated request into security middleware`);
  }
  for (const match of source.matchAll(/secureRoute\(\s*['"][^'"]+['"]\s*\)/g)) {
    const followingHandler = source.slice(match.index, match.index + 500);
    if (/\bctx\.auth\b/.test(followingHandler)) {
      failures.push(`${relative(root, file)} declares public access but dereferences ctx.auth`);
    }
  }
}

const requiredSnippets = [
  ['app/api/debug/env/route.ts', 'isLocalDebugRequest(request)'],
  ['app/api/debug/services/route.ts', 'isLocalDebugRequest(request)'],
  ['app/api/dev/demo-login/route.ts', 'isLocalTestHarnessRequest(request)'],
  ['lib/dev/local-endpoints.ts', "process.env.NODE_ENV === 'production'"],
  ['lib/dev/local-endpoints.ts', "process.env.ENABLE_LOCAL_TEST_HARNESS !== 'true'"],
  ['app/login/page.tsx', "process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true'"],
  ['app/api/cart/quote/route.ts', 'await authClient.auth.getUser()'],
  ['app/api/cart/quote/route.ts', 'user_id=eq.${user.id}'],
  ['lib/supabase/runtime-config.ts', 'if (!baseUrl || !serviceKey) return null'],
  ['app/api/metrics/route.ts', 'requireMetricsToken(req)'],
  ['app/api/metrics/prometheus/route.ts', 'requireMetricsToken(request)'],
  ['app/api/webhooks/route.ts', 'validateWebhookUrl(body.url)'],
  ['lib/integrations/webhooks/dispatcher.ts', "redirect: 'error'"],
  ['app/api/automation/rules/route.ts', "parseAutomationRuleInput(await req.json(), 'create')"],
  ['app/api/automation/rules/[id]/route.ts', "parseAutomationRuleInput(await req.json(), 'update')"],
  ['lib/integrations/automation/engine.ts', "new Set(['orders', 'drivers', 'restaurants'])"],
  ['lib/integrations/automation/engine.ts', 'Automation webhook signing secret is not configured'],
  ['lib/integrations/webhooks/dispatcher.ts', "from('webhook_deliveries')"],
  ['lib/integrations/webhooks/dispatcher.ts', 'hasPersistentDelivery(idempotencyKey)'],
  ['app/api/cron/webhook-retries/route.ts', 'timingSafeEqual'],
  ['app/api/cron/webhook-retries/route.ts', "process.env.CRON_SECRET || ''"],
  ['app/admin/refunds/page.tsx', "user.permissions.includes('payment_support')"],
  ['app/admin/recovery-queue/page.tsx', "permissions.includes('payment_support')"],
  ['components/admin/AdminLayout.tsx', "requiredPermission: 'payment_support'"],
];
for (const [path, expected] of requiredSnippets) {
  if (!readFileSync(join(root, path), 'utf8').includes(expected)) {
    failures.push(`${path} is missing required guard: ${expected}`);
  }
}

if (failures.length) {
  console.error(`API route safety: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`API route safety: PASS (${filesUnder(apiRoot).length} API source files checked)`);
