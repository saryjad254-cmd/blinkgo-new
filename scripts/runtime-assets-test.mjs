import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components', 'lib', 'public'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.css']);
const FORBIDDEN = [
  { label: 'unpkg runtime CDN', pattern: /https?:\/\/unpkg\.com/i },
  { label: 'jsDelivr runtime CDN', pattern: /https?:\/\/cdn\.jsdelivr\.net/i },
  { label: 'legacy fake Leaflet runtime', pattern: /leaflet-runtime-is-bundled/i },
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

const failures = [];
const files = ROOTS.flatMap(walk);
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const check of FORBIDDEN) {
    if (check.pattern.test(source)) failures.push(`${file}: ${check.label}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const globals = fs.readFileSync(path.join('app', 'globals.css'), 'utf8');
if (!packageJson.dependencies?.leaflet || !packageJson.dependencies?.['leaflet.markercluster']) {
  failures.push('package.json: bundled Leaflet dependencies are missing');
}
if (!globals.includes("@import 'leaflet/dist/leaflet.css'") || !globals.includes("@import 'leaflet.markercluster/dist/MarkerCluster.css'")) {
  failures.push('app/globals.css: bundled Leaflet styles are missing');
}

console.log(`Runtime asset audit: ${files.length} source files checked`);
if (failures.length > 0) {
  console.error(failures.map((failure) => `  ✗ ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Runtime asset audit: PASS — maps use bundled runtime assets');
