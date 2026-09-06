import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'environment-policy.json'), 'utf8'));
const allowedPublic = new Set(policy.publicSafe);
const runtimeRoots = ['app', 'components', 'lib'];
const runtimeFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) runtimeFiles.push(absolute);
  }
}

for (const directory of runtimeRoots) collect(path.join(root, directory));
runtimeFiles.push(path.join(root, 'proxy.ts'));

const referenced = new Set();
for (const file of runtimeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) referenced.add(match[1]);
}

const publicReferenced = [...referenced].filter((name) => name.startsWith('NEXT_PUBLIC_')).sort();
assert.deepEqual(publicReferenced, [...allowedPublic].sort(), 'public environment allow-list must exactly match runtime references');

const forbiddenPublicWords = /(?:SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE|WEBHOOK|CRON|TOKEN)/;
for (const name of publicReferenced) {
  assert.doesNotMatch(name, forbiddenPublicWords, `${name} looks secret and must not be public`);
}

const envFiles = fs.readdirSync(root).filter((name) => name.startsWith('.env') && name !== '.env.example');
const serverValues = new Map();
const publicValues = new Set();
for (const name of envFiles) {
  const content = fs.readFileSync(path.join(root, name), 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (match[1].startsWith('NEXT_PUBLIC_')) {
      if (value.length >= 12 && !/(?:placeholder|replace|xxxx|your-)/i.test(value)) publicValues.add(value);
      continue;
    }
    if (value.length >= 12 && !/(?:placeholder|replace|xxxx|your-)/i.test(value)) serverValues.set(match[1], value);
  }
}

const staticRoot = path.join(root, '.next', 'static');
assert.ok(fs.existsSync(staticRoot), 'run the production build before the browser-bundle secret contract');
const staticFiles = [];
collectStatic(staticRoot);

function collectStatic(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectStatic(absolute);
    else if (/\.(?:js|css|json|map)$/.test(entry.name)) staticFiles.push(absolute);
  }
}

const bundleText = staticFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const leakedNames = [];
for (const [name, value] of serverValues) {
  // A local server variable may deliberately mirror a reviewed public value
  // (notably a development Maps key). It is not evidence that a distinct
  // server secret was bundled. Production separation is asserted below.
  if (!publicValues.has(value) && bundleText.includes(value)) leakedNames.push(name);
}
assert.deepEqual(leakedNames, [], `server-only values found in browser bundle: ${leakedNames.join(', ')}`);
assert.doesNotMatch(bundleText, /sb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret-shaped key in browser bundle');
assert.doesNotMatch(bundleText, /sk_live_[A-Za-z0-9]{16,}/, 'Stripe live secret-shaped key in browser bundle');
assert.doesNotMatch(bundleText, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key material in browser bundle');

for (const name of ['.env.production', '.env.production.local']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const productionEnv = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(productionEnv, /^(?:APP_URL|NEXT_PUBLIC_APP_URL|ALLOWED_ORIGINS)=.*localhost/im, `${name} contains production localhost`);
  const values = Object.fromEntries(productionEnv.split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim()]));
  if (values.GOOGLE_MAPS_API_KEY && values.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    assert.notEqual(values.GOOGLE_MAPS_API_KEY, values.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, `${name} must use separate server and browser Maps keys`);
  }
}

console.log(`Production environment contract: PASS (${referenced.size} runtime variables, ${publicReferenced.length} public-safe, ${serverValues.size} local server-only values checked against ${staticFiles.length} browser assets).`);
