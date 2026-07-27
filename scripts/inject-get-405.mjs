#!/usr/bin/env node
/**
 * BlinkGo v80 — Inject GET 405 handler into all POST/PUT/DELETE/PATCH routes
 * that lack one. This fixes the "POST-only route returns 404 in production"
 * silent bug: with no GET, the route bundle entry is "missing" and Vercel
 * returns 404 to anyone probing (which makes the route look broken, not just
 * method-restricted).
 *
 * Usage: node scripts/inject-get-405.mjs
 * Idempotent: skips routes that already have a GET handler.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const ROUTES = await Array.fromAsync(glob('app/api/**/route.ts'));

const GET_HANDLER = `
/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
`;

let injected = 0;
let alreadyHad = 0;
let noStateChange = 0;
const errors = [];

for (const file of ROUTES) {
  let src;
  try {
    src = await readFile(file, 'utf8');
  } catch (e) {
    errors.push({ file, err: e.message });
    continue;
  }

  const hasGet = /^export\s+async\s+function\s+GET\b/m.test(src);
  if (hasGet) {
    alreadyHad++;
    continue;
  }

  const hasStateChange = /^export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)\b/m.test(src);
  if (!hasStateChange) {
    noStateChange++;
    continue;
  }

  // Detect the import line for NextResponse if it's already imported,
  // otherwise add the import.
  const hasNextResponseImport = /from\s+['"]next\/server['"]/.test(src);
  let newSrc;

  if (hasNextResponseImport) {
    // Insert GET handler at the end of the file (before any trailing comment)
    newSrc = src.trimEnd() + '\n' + GET_HANDLER;
  } else {
    // Add the import + GET handler
    const importLine = "import { NextResponse } from 'next/server';\n";
    // Find the last import line and insert after it
    const importMatches = [...src.matchAll(/^import\s.+$/gm)];
    const lastImport = importMatches[importMatches.length - 1];
    if (lastImport) {
      const insertAt = lastImport.index + lastImport[0].length;
      newSrc =
        src.slice(0, insertAt) +
        '\n' + importLine +
        src.slice(insertAt).trimEnd() +
        '\n' + GET_HANDLER;
    } else {
      // No imports at all — add at top
      newSrc = importLine + src.trimEnd() + '\n' + GET_HANDLER;
    }
  }

  try {
    await writeFile(file, newSrc, 'utf8');
    injected++;
  } catch (e) {
    errors.push({ file, err: e.message });
  }
}

console.log(`=== GET 405 injection summary ===`);
console.log(`Total routes checked: ${ROUTES.length}`);
console.log(`Already had GET:      ${alreadyHad}`);
console.log(`No state-changing method (skipped): ${noStateChange}`);
console.log(`Injected:             ${injected}`);
console.log(`Errors:               ${errors.length}`);
if (errors.length) {
  for (const e of errors) {
    console.log(`  - ${e.file}: ${e.err}`);
  }
}
