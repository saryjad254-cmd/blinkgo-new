#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Run with Vercel's production environment loaded. This script prints names
// and remediation text only; it never prints environment values.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/config/deployment-readiness.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadedModule = { exports: {} };
const productionEnv = { ...process.env, NODE_ENV: 'production' };
vm.runInNewContext(`(function(require,module,exports,process,URL){${code}\n})`, {}, {
  filename: 'deployment-readiness.ts',
})(require, loadedModule, loadedModule.exports, { env: productionEnv }, URL);

const readiness = loadedModule.exports.getDeploymentReadiness();
const missing = readiness.items.filter((item) => item.required && item.status !== 'ready');

if (missing.length > 0) {
  console.error(`Production readiness: FAIL (${missing.length} required item(s) missing)`);
  for (const item of missing) console.error(`- ${item.id}: ${item.detail}`);
  process.exitCode = 1;
} else {
  console.log(`Production readiness: PASS (${readiness.summary.ready}/${readiness.summary.total})`);
}
