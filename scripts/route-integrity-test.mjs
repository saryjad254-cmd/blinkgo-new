import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const appRoot = join(root, 'app');
const scanRoots = [join(root, 'app'), join(root, 'components')];

function filesUnder(dir, predicate) {
  const output = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) output.push(...filesUnder(full, predicate));
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function routeFromPage(file) {
  const folder = relative(appRoot, file.slice(0, -'page.tsx'.length)).split(sep)
    .filter(Boolean).filter((part) => !(part.startsWith('(') && part.endsWith(')')));
  return '/' + folder.join('/');
}

const pageRoutes = filesUnder(appRoot, (file) => file.endsWith(`${sep}page.tsx`)).map(routeFromPage);
// Catch-all not-found pages are fallbacks, not valid navigation targets. Including
// them here would make every broken link look valid.
const routePatterns = pageRoutes.filter((route) => !route.includes('[...not-found]')).map((route) => {
  const source = route === '/'
    ? '/'
    : route.split('/').filter(Boolean).map((segment) => {
      if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return '.+';
      if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return '.*';
      if (/^\[[^\]]+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
  return { route, regex: new RegExp(`^${route === '/' ? source : `/${source}`}$`) };
});

const references = [];
const patterns = [
  { regex: /href\s*=\s*["']([^"']+)["']/g, group: 1 },
  { regex: /href\s*=\s*`([^`]+)`/g, group: 1 },
  { regex: /href\s*=\s*\{\s*["']([^"']+)["']\s*\}/g, group: 1 },
  { regex: /href\s*=\s*\{\s*`([^`]+)`\s*\}/g, group: 1 },
  { regex: /\bhref\s*:\s*["']([^"']+)["']/g, group: 1 },
  { regex: /\bhref\s*:\s*`([^`]+)`/g, group: 1 },
  { regex: /(?:router\.(?:push|replace)|redirect)\(\s*["']([^"']+)["']/g, group: 1 },
  { regex: /(?:router\.(?:push|replace)|redirect)\(\s*`([^`]+)`/g, group: 1 },
];
for (const base of scanRoots) {
  for (const file of filesUnder(base, (entry) => /\.(?:ts|tsx)$/.test(entry))) {
    const content = readFileSync(file, 'utf8');
    for (const { regex, group } of patterns) {
      for (const match of content.matchAll(regex)) {
        const raw = match[group];
        if (!raw.startsWith('/') || raw.startsWith('/api/')) continue;
        const pathname = raw
          .split(/[?#]/)[0]
          .replace(/\/\$\{[^}]+\}/g, '/__DYNAMIC__')
          .replace(/\$\{[^}]+\}/g, '')
          .replace(/\/$/, '') || '/';
        references.push({ pathname, raw, file: relative(root, file), index: match.index ?? 0 });
      }
    }
  }
}

const missing = references.filter((ref) => {
  if (routePatterns.some((candidate) => candidate.regex.test(ref.pathname))) return false;
  // Metadata links and icons can point directly at public files.
  if (/\.[a-z0-9]{2,8}$/i.test(ref.pathname) && existsSync(join(root, 'public', ref.pathname.slice(1)))) return false;
  return true;
});
const uniqueMissing = [...new Map(missing.map((item) => [`${item.file}:${item.raw}`, item])).values()];
console.log(`Pages discovered: ${pageRoutes.length}`);
console.log(`Static navigation references checked: ${references.length}`);
if (uniqueMissing.length) {
  console.error(`Missing page targets: ${uniqueMissing.length}`);
  for (const item of uniqueMissing) console.error(`  ${item.file} -> ${item.raw}`);
  process.exit(1);
}
console.log('Route integrity: PASS');
