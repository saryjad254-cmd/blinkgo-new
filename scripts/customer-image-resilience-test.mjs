import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const resilientSource = read('components/customer/CatalogImage.tsx');
for (const [label, pattern] of [
  ['records the failed source', /setFailedSrc\(usableSrc\)/],
  ['renders a local branded fallback', /PALETTES\[Math\.abs\(paletteIndex\)/],
  ['keeps a loading placeholder', /!loaded &&/],
  ['provides responsive sizes', /sizes=\{sizes\}/],
]) {
  if (!pattern.test(resilientSource)) failures.push(`CatalogImage: ${label}`);
}

const primarySurfaces = [
  'components/customer/RestaurantCard.tsx',
  'components/customer/PremiumRestaurantCard.tsx',
  'components/customer/OptimizedRestaurantCard.tsx',
  'components/customer/PremiumProductCard.tsx',
  'components/customer/ProductDetailModal.tsx',
  'components/customer/ActiveOrderCard.tsx',
  'app/(customer)/home/HomeClient.tsx',
];
for (const file of primarySurfaces) {
  if (!/CatalogImage/.test(read(file))) failures.push(`${file}: resilient catalog imagery is not used`);
}

const avatarSource = read('components/customer/UserAvatar.tsx');
if (/gravatar|ui-avatars/i.test(avatarSource)) failures.push('UserAvatar: third-party avatar fallback leaks identity or adds a runtime dependency');
if (!/fallbackInitials/.test(avatarSource)) failures.push('UserAvatar: local initials fallback is missing');

if (failures.length) {
  console.error(`Customer image resilience failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Customer image resilience passed: ${primarySurfaces.length} primary catalog surfaces use a local branded failure state.`);
