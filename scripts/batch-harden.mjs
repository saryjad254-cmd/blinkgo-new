#!/usr/bin/env node
/**
 * Batch-harden remaining API routes by adding the withSecurity wrapper
 * at the GET/POST/PATCH/DELETE entry points.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ROUTES = process.argv.slice(2);
if (ROUTES.length === 0) {
  console.error('Usage: node batch-harden.mjs <route>...');
  process.exit(1);
}

for (const rel of ROUTES) {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) {
    console.error(`SKIP: ${rel} not found`);
    continue;
  }
  let src = fs.readFileSync(fullPath, 'utf8');

  // Skip if already wrapped
  if (src.includes('withSecurity') || src.includes('requireApiRole')) {
    console.log(`SKIP: ${rel} already has security wrapper`);
    continue;
  }

  // Add imports after first import line
  const importBlock = `import { withSecurity } from '@/lib/api/security';\nimport { secureRoute } from '@/lib/api/security-helpers';\n`;
  const firstImport = src.indexOf("import ");
  if (firstImport === -1) {
    console.error(`SKIP: ${rel} has no imports`);
    continue;
  }
  // Insert after the last line of the first import block
  const lines = src.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) lastImportIdx = i;
    else if (lastImportIdx !== -1 && lines[i].trim() === '') continue;
    else break;
  }
  lines.splice(lastImportIdx + 1, 0, importBlock);
  src = lines.join('\n');

  fs.writeFileSync(fullPath, src);
  console.log(`OK: ${rel} imports added`);
}
