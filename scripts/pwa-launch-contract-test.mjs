import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public', 'manifest.json');
const layoutPath = path.join(root, 'app', 'layout.tsx');
const serviceWorkerPath = path.join(root, 'public', 'sw.js');
const baseUrl = process.env.BLINKGO_PWA_BASE_URL?.replace(/\/$/, '');
let passed = 0;

function check(label, assertion) {
  assertion();
  passed += 1;
  console.log(`  PASS ${label}`);
}

function publicFile(publicUrl) {
  assert.ok(publicUrl.startsWith('/'), `public URL must be root-relative: ${publicUrl}`);
  return path.join(root, 'public', ...publicUrl.slice(1).split('/'));
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length >= 24, `${filePath} is too small to be a PNG`);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const layout = fs.readFileSync(layoutPath, 'utf8');
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');

console.log('\nBlinkGo PWA launch contract');

check('manifest has production app identity', () => {
  assert.equal(manifest.short_name, 'BlinkGo');
  assert.match(manifest.name, /^BlinkGo\b/);
  assert.equal(manifest.start_url, '/home?source=pwa');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'de');
});

check('manifest uses the official BlinkGo palette', () => {
  assert.equal(manifest.background_color.toUpperCase(), '#08090B');
  assert.equal(manifest.theme_color.toUpperCase(), '#E10600');
});

check('manifest exposes maskable and regular 192/512 icons', () => {
  const contracts = new Map(manifest.icons.map((icon) => [`${icon.purpose}:${icon.sizes}`, icon]));
  for (const key of ['maskable:192x192', 'maskable:512x512', 'any:192x192', 'any:512x512']) {
    assert.ok(contracts.has(key), `missing icon ${key}`);
  }

  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const filePath = publicFile(icon.src);
    assert.ok(fs.existsSync(filePath), `missing icon file ${icon.src}`);
    const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngDimensions(filePath), { width: expectedWidth, height: expectedHeight });
  }
});

check('manifest shortcuts only reference existing official icons', () => {
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);
  for (const shortcut of manifest.shortcuts) {
    assert.ok(shortcut.name && shortcut.short_name && shortcut.url.startsWith('/'));
    for (const icon of shortcut.icons ?? []) {
      assert.ok(fs.existsSync(publicFile(icon.src)), `missing shortcut icon ${icon.src}`);
    }
  }
});

check('layout references the canonical manifest and official icons', () => {
  assert.match(layout, /manifest:\s*['"]\/manifest\.json['"]/);
  assert.match(layout, /rel="manifest" href="\/manifest\.json"/);
  assert.match(layout, /blinkgo-app-icon-192-v2\.png/);
  assert.match(layout, /blinkgo-app-icon-512-v2\.png/);
});

check('service worker provides an offline shell without caching APIs', () => {
  assert.ok(fs.existsSync(path.join(root, 'public', 'offline.html')));
  assert.match(serviceWorker, /request\.mode === ['"]navigate['"]/);
  assert.match(serviceWorker, /caches\.match\(['"]\/offline\.html['"]\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\(['"]\/api\/['"]\)\) return/);
});

check('public email logo is a valid production-sized PNG', () => {
  const logoPath = path.join(root, 'public', 'brand', 'blinkgo-email-logo.png');
  assert.ok(fs.existsSync(logoPath));
  const { width, height } = pngDimensions(logoPath);
  assert.ok(width >= 200 && width <= 1200, `unexpected email logo width ${width}`);
  assert.ok(height >= 40 && height <= 600, `unexpected email logo height ${height}`);
});

if (baseUrl) {
  const fetchContract = async (pathname, expectedStatus, expectedType) => {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual' });
    assert.equal(response.status, expectedStatus, `${pathname} returned ${response.status}`);
    assert.match(response.headers.get('content-type') ?? '', expectedType, `${pathname} content-type`);
  };

  await fetchContract('/manifest.json', 200, /application\/json/i);
  passed += 1;
  console.log('  PASS running app serves manifest as JSON');

  for (const icon of manifest.icons) {
    await fetchContract(icon.src, 200, /image\/png/i);
  }
  passed += 1;
  console.log('  PASS running app serves every manifest icon as PNG');

  await fetchContract('/brand/blinkgo-email-logo.png', 200, /image\/png/i);
  passed += 1;
  console.log('  PASS running app serves the email logo as PNG');

  await fetchContract(`/__blinkgo_missing_${Date.now()}`, 404, /text\/html/i);
  passed += 1;
  console.log('  PASS unknown application route returns HTTP 404');
} else {
  console.log('  INFO runtime HTTP checks skipped (set BLINKGO_PWA_BASE_URL)');
}

console.log(`\nPWA contract: ${passed}/${passed} passed\n`);
