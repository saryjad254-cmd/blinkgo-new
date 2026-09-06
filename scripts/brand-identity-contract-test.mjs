import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const textRoots = ['app', 'components', 'public'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.svg']);
const forbiddenTokens = [
  ['legacy red #DC2626', /#dc2626/gi],
  ['legacy yellow #F5B819', /#f5b819/gi],
  ['legacy amber #F59E0B', /#f59e0b/gi],
  ['legacy slate canvas #0F172A', /#0f172a/gi],
  ['retired wordmark asset', /blinkgo-wordmark\.svg/gi],
  ['retired full-logo asset', /blinkgo-(?:logo|full)\.svg/gi],
  ['alternate B mark in UI source', /\/brand\/blinkgo-b\.svg/gi],
  ['alternate full raster logo in UI source', /\/brand\/blinkgo-official-full-transparent\.png/gi],
  ['alternate 3D raster logo in UI source', /\/brand\/blinkgo-3d\.png/gi],
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const failures = [];
for (const textRoot of textRoots) {
  for (const file of walk(path.join(root, textRoot))) {
    if (!extensions.has(path.extname(file))) continue;
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const [label, pattern] of forbiddenTokens) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) failures.push(`${relative}: ${label}`);
    }
  }
}

const requiredAssets = [
  'public/brand/blinkgo-official-compact-transparent.png',
  'public/brand/blinkgo-discovery-hero-v2.webp',
  'public/brand/icon-192.png',
  'public/brand/icon-512.png',
  'public/brand/blinkgo-og.png',
];
for (const asset of requiredAssets) {
  const absolute = path.join(root, asset);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size === 0) {
    failures.push(`${asset}: canonical asset is missing or empty`);
  }
}

const officialLogoContract = [
  ['components/brand/brand-assets.ts', 'OFFICIAL_BLINKGO_LOGO_SRC'],
  ['components/brand/BlinkLogo.tsx', 'OFFICIAL_BLINKGO_LOGO_SRC'],
  ['components/startup/AppBootCoordinator.tsx', '<BlinkLogo'],
  ['components/auth/AuthShell.tsx', '<BlinkLogo'],
  ['components/customer/AppHeader.tsx', '<BlinkLogo'],
  ['components/shared/PageHeader.tsx', '<BlinkLogo'],
  ['components/account/AccountDashboard.tsx', '<BlinkLogo'],
  ['app/(customer)/restaurants/[id]/page.tsx', '<BlinkLogo'],
  ['app/(customer)/orders/[id]/track/page.tsx', '<BlinkLogo'],
  ['components/shared/BrandedNotFound.tsx', '<BlinkLogo'],
];
for (const [relative, token] of officialLogoContract) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes(token)) failures.push(`${relative}: official logo contract missing`);
}

const assetSource = fs.readFileSync(path.join(root, 'components/brand/brand-assets.ts'), 'utf8');
if ((assetSource.match(/blinkgo-official-compact-transparent\.png/g) || []).length !== 1) {
  failures.push('components/brand/brand-assets.ts: official logo must have exactly one canonical declaration');
}

if (failures.length) {
  console.error(`Brand identity contract failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Brand identity contract passed: canonical palette and assets are consistent.');
