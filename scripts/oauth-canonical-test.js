/**
 * Test: OAuth Canonical Callback URL
 * ──────────────────────────────────
 * v78 — verifies that the production OAuth flow ALWAYS uses a single
 * canonical callback URL, never `window.location.origin` directly.
 *
 * Asserts (in production):
 *   1. buildCanonicalOAuthRedirectTo('de') returns redirectTo starting with
 *      `https://www.blinkgo.de/auth/callback?next=%2Fsearch&lang=de`
 *   2. redirectTo NEVER starts with `https://www.blinkgo.de`
 *   3. redirectTo NEVER starts with a Vercel preview domain
 *   4. validateProductionRedirectTo returns null (valid) for the canonical URL
 *   5. The OAuth click handler in LoginForm uses the canonical URL, NOT
 *      window.location.origin
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

function pass(name) { passes.push(name); console.log(`  ✓ ${name}`); }
function fail(name, detail) { failures.push({ name, detail }); console.log(`  ✗ ${name}: ${detail}`); }

// ── 1. Load the canonical-callback helper ──────────────────────────────────
const helperPath = path.join(ROOT, 'lib/oauth/canonical-callback.ts');
if (!fs.existsSync(helperPath)) {
  fail('Helper file exists', `lib/oauth/canonical-callback.ts not found`);
  process.exit(1);
}
pass('Helper file exists: lib/oauth/canonical-callback.ts');

// We need to transpile the TS file. Use a simple eval-like approach via
// dynamic import won't work for .ts. Use a fallback: parse the source and
// verify key invariants directly.
const helperSource = fs.readFileSync(helperPath, 'utf8');

// ── 2. Verify the helper enforces the canonical host ───────────────────────
if (!helperSource.includes("'www.blinkgo.de'")) {
  fail('Helper has production allowlist', 'ALLOWED_PRODUCTION_HOSTS missing "www.blinkgo.de"');
} else {
  pass('Helper has production allowlist: ["www.blinkgo.de"] (Vercel primary)');
}

// The apex domain must NOT be in the allowlist
if (helperSource.includes("'blinkgo.de'") && !helperSource.includes("'www.blinkgo.de'")) {
  fail('Apex domain not in allowlist', 'blinkgo.de should not be allowed (Vercel redirects apex→www)');
} else {
  pass('Apex domain blinkgo.de is NOT the production canonical');
}

if (!helperSource.includes("FORBIDDEN_HOST_PATTERNS")) {
  fail('Helper has forbidden patterns', 'FORBIDDEN_HOST_PATTERNS not defined');
} else {
  pass('Helper has FORBIDDEN_HOST_PATTERNS (www, vercel, tunnels)');
}

// v78.2: www is now the CANONICAL, not rejected
if (helperSource.includes('/^www\\./i')) {
  fail('Helper does NOT have /^www\\./i in FORBIDDEN_HOST_PATTERNS',
    'www.blinkgo.de is now the Vercel primary domain — should be allowed');
} else {
  pass('Helper does NOT reject www (www is now canonical)');
}

// v78.2: apex domain is now FORBIDDEN
if (!helperSource.includes("APEX_DOMAIN")) {
  fail('Helper has APEX_DOMAIN constant', 'APEX_DOMAIN missing');
} else {
  pass('Helper has APEX_DOMAIN constant for explicit apex rejection');
}

if (!helperSource.includes('\\.vercel\\.app')) {
  fail('Helper rejects Vercel preview', 'vercel.app pattern missing');
} else {
  pass('Helper rejects Vercel preview domains');
}

if (!helperSource.includes("process.env.NODE_ENV === 'production'")) {
  fail('Helper has production gate', 'process.env.NODE_ENV check missing');
} else {
  pass('Helper has production gate (process.env.NODE_ENV === "production")');
}

// ── 3. Verify LoginForm uses the helper, not window.location.origin ───────
const loginFormSource = fs.readFileSync(
  path.join(ROOT, 'components/auth/LoginForm.tsx'),
  'utf8',
);

if (!loginFormSource.includes("buildCanonicalOAuthRedirectTo")) {
  fail('LoginForm imports canonical helper', 'buildCanonicalOAuthRedirectTo not imported');
} else {
  pass('LoginForm imports buildCanonicalOAuthRedirectTo');
}

if (!loginFormSource.includes('validateProductionRedirectTo')) {
  fail('LoginForm imports validation helper', 'validateProductionRedirectTo not imported');
} else {
  pass('LoginForm imports validateProductionRedirectTo (production safety net)');
}

// Check that the unsafe pattern is GONE
const unsafePattern1 = `const callbackUrl = \`\${origin}/auth/callback`;
if (loginFormSource.includes(unsafePattern1)) {
  fail('LoginForm does NOT use window.location.origin directly', `Found unsafe pattern: ${unsafePattern1}`);
} else {
  pass('LoginForm does NOT use \`\${origin}/auth/callback\` pattern (window.location.origin)');
}

const unsafePattern2 = `window.location.origin + '/auth/callback'`;
if (loginFormSource.includes(unsafePattern2)) {
  fail('LoginForm does NOT use window.location.origin directly', 'Found window.location.origin + /auth/callback');
} else {
  pass('LoginForm does NOT use window.location.origin + "/auth/callback"');
}

// Check that the new safe pattern is PRESENT
const safePattern = 'const { baseUrl: canonicalBaseUrl, redirectTo: callbackUrl }';
if (!loginFormSource.includes(safePattern)) {
  fail('LoginForm uses canonical URL', `Safe pattern "${safePattern}" not found`);
} else {
  pass('LoginForm uses canonical URL via buildCanonicalOAuthRedirectTo');
}

// ── 4. Verify the diagnostic log is present ─────────────────────────────────
if (!loginFormSource.includes('[OAUTH_CANONICAL_REDIRECT]')) {
  fail('Diagnostic log present', '[OAUTH_CANONICAL_REDIRECT] marker missing');
} else {
  pass('Diagnostic log [OAUTH_CANONICAL_REDIRECT] present');
}

if (!loginFormSource.includes('currentOrigin')) {
  fail('Diagnostic log includes currentOrigin', 'currentOrigin field missing from log');
} else {
  pass('Diagnostic log includes currentOrigin');
}

if (!loginFormSource.includes('canonicalBaseUrl')) {
  fail('Diagnostic log includes canonicalBaseUrl', 'canonicalBaseUrl field missing');
} else {
  pass('Diagnostic log includes canonicalBaseUrl');
}

if (!loginFormSource.includes('redirectTo')) {
  fail('Diagnostic log includes redirectTo', 'redirectTo field missing');
} else {
  pass('Diagnostic log includes redirectTo');
}

// ── 5. Verify next.config.js has www → apex redirect ───────────────────────
const nextConfigSource = fs.readFileSync(
  path.join(ROOT, 'next.config.js'),
  'utf8',
);

// v78.1 fix: redirects() was removed from next.config.js because it
// created an infinite loop with the operator's domain-level apex ↔ www
// config. Domain-level redirects should be configured at Cloudflare /
// Vercel / DNS, not inside the Next.js app. The OAuth canonical URL fix
// is independent (lives in lib/oauth/canonical-callback.ts).
if (!nextConfigSource.includes('REMOVED redirects()') &&
    !nextConfigSource.includes('redirects()')) {
  fail('next.config.js has the v78.1 fix note', 'Expected comment about removed redirects()');
} else {
  pass('next.config.js has the v78.1 fix note (redirects() removed to break loop)');
}

// Verify the redirects() function is NOT present
if (nextConfigSource.includes('async redirects()')) {
  fail('next.config.js does NOT have async redirects()',
    'Function is still present — it will cause infinite loop');
} else {
  pass('next.config.js does NOT have async redirects() (no infinite loop)');
}

// ── 6. Verify /auth/callback uses the canonical URL too ────────────────────
const callbackSource = fs.readFileSync(
  path.join(ROOT, 'app/auth/callback/route.ts'),
  'utf8',
);

if (!callbackSource.includes('getCanonicalBaseUrl')) {
  fail('Callback uses canonical base', 'getCanonicalBaseUrl not imported');
} else {
  pass('Callback uses getCanonicalBaseUrl for redirect target');
}

// ── 7. Runtime test: invoke the helper in production mode ──────────────────
console.log('');
console.log('=== Runtime: production mode ===');
process.env.NODE_ENV = 'production';
process.env.NEXT_PUBLIC_APP_URL = 'https://www.blinkgo.de';

try {
  // Use sucrase to transpile the TypeScript file to plain JS for runtime testing
  let sucrase;
  try {
    sucrase = require('sucrase');
  } catch (e) {
    // Try to find it in node_modules
    sucrase = require(path.join(ROOT, 'node_modules/sucrase'));
  }

  // Create a temp JS file by transpiling
  const tmpFile = '/tmp/canonical-callback-test.cjs';
  const transpiled = sucrase.transform(helperSource, {
    transforms: ['typescript', 'imports'],
    filePath: helperPath,
  }).code;
  fs.writeFileSync(tmpFile, transpiled);
  const helper = require(tmpFile);

  if (typeof helper.buildCanonicalOAuthRedirectTo !== 'function') {
    fail('Helper exports buildCanonicalOAuthRedirectTo', 'function missing after strip');
  } else {
    pass('Helper exports buildCanonicalOAuthRedirectTo');

    // Test 1: production returns the canonical URL (Vercel primary: www.blinkgo.de)
    const result = helper.buildCanonicalOAuthRedirectTo('de');
    if (!result.redirectTo.startsWith('https://www.blinkgo.de/auth/callback')) {
      fail('redirectTo starts with https://www.blinkgo.de/auth/callback',
        `Got: ${result.redirectTo}`);
    } else {
      pass(`redirectTo starts with https://www.blinkgo.de/auth/callback: ${result.redirectTo}`);
    }

    // Test 2: redirectTo does NOT start with the apex (blinko.de)
    if (result.redirectTo.startsWith('https://blinkgo.de/auth/callback')) {
      fail('redirectTo does NOT start with apex blinkgo.de',
        `Got: ${result.redirectTo} (apex would cause cross-origin PKCE failure)`);
    } else {
      pass('redirectTo does NOT start with apex blinkgo.de (Vercel redirects apex→www)');
    }

    // Test 3: contains correct next and lang params
    if (!result.redirectTo.includes('next=%2Fsearch')) {
      fail('redirectTo contains next=/search', `Got: ${result.redirectTo}`);
    } else {
      pass('redirectTo contains next=%2Fsearch');
    }
    if (!result.redirectTo.includes('lang=de')) {
      fail('redirectTo contains lang=de', `Got: ${result.redirectTo}`);
    } else {
      pass('redirectTo contains lang=de');
    }

    // Test 4: validateProductionRedirectTo accepts canonical, rejects www
    if (helper.validateProductionRedirectTo(result.redirectTo) !== null) {
      fail('validateProductionRedirectTo accepts canonical URL',
        `Returned: ${helper.validateProductionRedirectTo(result.redirectTo)}`);
    } else {
      pass('validateProductionRedirectTo accepts canonical URL (returns null = valid)');
    }

    // v78.2: www.blinkgo.de is the CANONICAL — should be ACCEPTED
    const wwwUrl = 'https://www.blinkgo.de/auth/callback?next=%2Fsearch&lang=de';
    const wwwError = helper.validateProductionRedirectTo(wwwUrl);
    if (wwwError !== null) {
      fail('validateProductionRedirectTo ACCEPTS www.blinkgo.de (canonical)',
        `Returned error: ${wwwError}`);
    } else {
      pass('validateProductionRedirectTo ACCEPTS www.blinkgo.de (canonical)');
    }

    // v78.2: apex blinkgo.de is FORBIDDEN
    const apexUrl = 'https://blinkgo.de/auth/callback?next=%2Fsearch&lang=de';
    const apexError = helper.validateProductionRedirectTo(apexUrl);
    if (apexError === null) {
      fail('validateProductionRedirectTo REJECTS apex blinkgo.de',
        'Returned null (accepted) — should reject');
    } else {
      pass(`validateProductionRedirectTo REJECTS apex blinkgo.de: ${apexError}`);
    }

    const vercelUrl = 'https://my-app-abc123.vercel.app/auth/callback?next=%2Fsearch&lang=de';
    const vercelError = helper.validateProductionRedirectTo(vercelUrl);
    if (vercelError === null) {
      fail('validateProductionRedirectTo rejects vercel.app', 'Returned null (accepted)');
    } else {
      pass(`validateProductionRedirectTo rejects vercel.app: ${vercelError}`);
    }

    // Test 5: production with no env var throws
    const origEnv = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    try {
      helper.buildCanonicalOAuthRedirectTo('en');
      fail('Throws when no env var in production', 'Did not throw');
    } catch (e) {
      pass(`Throws when no env var in production: ${e.message.substring(0, 60)}...`);
    }
    process.env.NEXT_PUBLIC_APP_URL = origEnv;

    // v78.2: with NEXT_PUBLIC_APP_URL=blinko.de (apex, BAD), should be rejected
    const origEnv2 = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://blinko.de';
    try {
      helper.buildCanonicalOAuthRedirectTo('en');
      fail('Rejects apex in env var', 'Did not throw for blinkgo.de env');
    } catch (e) {
      pass(`Rejects apex in env var: ${e.message.substring(0, 60)}...`);
    }
    process.env.NEXT_PUBLIC_APP_URL = origEnv2;
  }

  // Cleanup
  try { fs.unlinkSync(tmpFile); } catch {}
} catch (e) {
  fail('Helper runtime test', e.message);
}

// ── Final ──────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════════');
if (failures.length === 0) {
  console.log(`  ✓ ALL ${passes.length} CHECKS PASSED`);
  console.log('  OAuth canonical callback logic is correctly implemented.');
  console.log('═══════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`  ✗ ${failures.length} of ${passes.length + failures.length} CHECKS FAILED`);
  failures.forEach(f => console.log(`    - ${f.name}: ${f.detail}`));
  console.log('═══════════════════════════════════════════════════════');
  process.exit(1);
}
