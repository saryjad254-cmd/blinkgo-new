// merge-locales.mjs — inserts missing keys into ar/de/en locale files (text-level, preserves comments)
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const master = JSON.parse(fs.readFileSync('/tmp/master-translations.json', 'utf-8'));

function load(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, require);
  return m.exports.default;
}
function flat(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = p ? p + '.' + k : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

for (const loc of ['de', 'ar', 'en']) {
  const file = `lib/i18n/locales/${loc}.ts`;
  let src = fs.readFileSync(file, 'utf-8');
  const existing = flat(load(file));
  // group additions by top section path (support 2 and 3 level keys)
  const bySection = {};
  let added = 0;
  for (const [key, tr] of Object.entries(master)) {
    if (key in existing) continue;
    if (!tr[loc]) continue;
    const parts = key.split('.');
    const section = parts[0];
    const rest = parts.slice(1);
    (bySection[section] ||= []).push({ rest, value: tr[loc] });
  }
  for (const [section, entries] of Object.entries(bySection)) {
    // find "  section: {" at top level (2-space indent)
    const re = new RegExp(`^(  ${section}:\\s*\\{)`, 'm');
    const m = src.match(re);
    let insert = '';
    // build insert lines; nested (3-level) keys become "sub: { ... }" only if sub-object doesn't exist,
    // else insert into the existing sub-object
    const simple = entries.filter((e) => e.rest.length === 1);
    const nested = entries.filter((e) => e.rest.length === 2);
    for (const e of simple) insert += `    ${/^[A-Za-z_$][\w$]*$/.test(e.rest[0]) ? e.rest[0] : `'${e.rest[0]}'`}: '${esc(e.value)}',\n`;
    // handle nested: group by sub
    const bySub = {};
    for (const e of nested) (bySub[e.rest[0]] ||= []).push(e);
    for (const [sub, es] of Object.entries(bySub)) {
      const subRe = new RegExp(`^(  ${section}:[\\s\\S]*?^    ${sub}:\\s*\\{)`, 'm');
      const subM = src.match(subRe);
      const lines = es.map((e) => `      ${/^[A-Za-z_$][\w$]*$/.test(e.rest[1]) ? e.rest[1] : `'${e.rest[1]}'`}: '${esc(e.value)}',`).join('\n');
      if (subM) {
        src = src.replace(subRe, `$1\n${lines}`);
        added += es.length;
      } else {
        insert += `    ${sub}: {\n${lines}\n    },\n`;
      }
    }
    if (insert) {
      if (m) {
        src = src.replace(re, `$1\n${insert.trimEnd()}`);
      } else {
        // create the whole section before the final "};" of the default object
        const block = `  ${section}: {\n${insert.trimEnd()}\n  },\n`;
        // insert before last occurrence of "\n};"
        const idx = src.lastIndexOf('\n};');
        src = src.slice(0, idx) + '\n' + block + src.slice(idx + 1);
      }
      added += insert.split('\n').filter((l) => l.includes(': ')).length;
    }
  }
  fs.writeFileSync(file, src);
  console.log(`${loc}: +${added} keys`);
}

// Fix wrong-language values in en locale (German leaked into English)
let en = fs.readFileSync('lib/i18n/locales/en.ts', 'utf-8');
const fixes = [
  [/continueAs:\s*'Weiter als'/, "continueAs: 'Continue as'"],
  [/orderTracking:\s*'Bestellung verfolgen'/, "orderTracking: 'Track order'"],
  [/rateOrder:\s*'Bestellung bewerten'/, "rateOrder: 'Rate order'"],
  [/newOrderAlert:\s*'Neue Bestellung!'/, "newOrderAlert: 'New order!'"],
];
let fixed = 0;
for (const [re, rep] of fixes) if (re.test(en)) { en = en.replace(re, rep); fixed++; }
fs.writeFileSync('lib/i18n/locales/en.ts', en);
console.log(`en wrong-language fixes: ${fixed}`);
