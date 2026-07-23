// ui-audit.mjs — objective visual-consistency scanner
import fs from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (/node_modules|\.next|\.git|scripts\//.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})('.');
const pages = files.filter((f) => f.startsWith('app/') || f.startsWith('components/'));

const issues = { rtl: [], overflow: [], container: [], radius: [], shadow: [], skeleton: [], sticky: [] };

// Physical direction classes that break RTL (safe logical equivalents exist)
const RTL_CLASS = /(?<=["'`\s])(ml|mr|pl|pr)-(\d+(?:\.\d+)?|px|auto)(?=["'`\s])|(?<=["'`\s])(left|right)-(\d+(?:\.\d+)?|px)(?=["'`\s])|(?<=["'`\s])text-(left|right)(?=["'`\s])|(?<=["'`\s])rounded-(l|r|tl|tr|bl|br)(-\w+)?(?=["'`\s])|(?<=["'`\s])border-(l|r)(-\d)?(?=["'`\s])/g;

// truncate inside flex child without min-w-0 on itself or nearby
for (const f of pages) {
  const src = fs.readFileSync(f, 'utf-8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // skip rotate/scroll transforms, translate-x (animations kept)
    if (/className/.test(line)) {
      let m;
      RTL_CLASS.lastIndex = 0;
      const found = [];
      while ((m = RTL_CLASS.exec(line))) found.push(m[0]);
      if (found.length) issues.rtl.push(`${f}:${i + 1}: ${found.join(',')} :: ${line.trim().slice(0, 90)}`);
    }
    if (/truncate|line-clamp/.test(line) && /flex-1/.test(line) && !/min-w-0/.test(line)) {
      issues.overflow.push(`${f}:${i + 1}: flex-1 + truncate without min-w-0`);
    }
    if (/shadow-(sm|md|lg|xl|2xl)\b/.test(line) && !/speed|glow/.test(line)) {
      issues.shadow.push(`${f}:${i + 1}: raw tailwind shadow (design system uses shadow-speed-*): ${line.trim().slice(0, 80)}`);
    }
    if (/rounded-(2xl|3xl|full)\b/.test(line) && !/rounded-full/.test(line)) {
      issues.radius.push(`${f}:${i + 1}: ${line.match(/rounded-\w+/)[0]}`);
    }
  });
}

// Page container consistency: top-level page files should use max-w-* + px-4 pattern
const pageFiles = files.filter((f) => /^app\/.*page\.tsx$/.test(f));
for (const f of pageFiles) {
  const src = fs.readFileSync(f, 'utf-8');
  if (!/max-w-(2xl|3xl|4xl|5xl|6xl|7xl)/.test(src) && /className/.test(src) && src.length > 1500) {
    issues.container.push(f);
  }
}

// Sections without a loading.tsx (skeleton coverage)
const sections = ['app/(customer)/favorites', 'app/(customer)/notifications', 'app/(customer)/profile', 'app/driver/orders', 'app/driver/earnings', 'app/driver/history', 'app/restaurant/orders', 'app/restaurant/menu', 'app/admin'];
for (const s of sections) {
  if (fs.existsSync(s) && !fs.existsSync(path.join(s, 'loading.tsx'))) issues.skeleton.push(s);
}

const summary = Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length]));
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync('/tmp/ui-audit.json', JSON.stringify(issues, null, 1));
// top RTL offenders by file
const cnt = {};
for (const e of issues.rtl) { const f = e.split(':')[0]; cnt[f] = (cnt[f] || 0) + 1; }
console.log('\nTop RTL-physical-class files:');
Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([f, c]) => console.log(`  ${c}\t${f}`));
