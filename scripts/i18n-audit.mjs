// i18n-audit.mjs — full project i18n scanner
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadLocale(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports.default;
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const de = flatten(loadLocale('lib/i18n/locales/de.ts'));
const ar = flatten(loadLocale('lib/i18n/locales/ar.ts'));
const en = flatten(loadLocale('lib/i18n/locales/en.ts'));

const keys = { de: new Set(Object.keys(de)), ar: new Set(Object.keys(ar)), en: new Set(Object.keys(en)) };
const all = new Set([...keys.de, ...keys.ar, ...keys.en]);

const missing = { de: [], ar: [], en: [] };
for (const k of all) for (const loc of ['de', 'ar', 'en']) if (!keys[loc].has(k)) missing[loc].push(k);

// Values in the WRONG language inside locale files
const AR_RE = /[\u0600-\u06FF]/;
const wrongLang = [];
for (const [k, v] of Object.entries(de)) if (typeof v === 'string' && AR_RE.test(v)) wrongLang.push(`de.${k} contains ARABIC: ${v.slice(0, 40)}`);
for (const [k, v] of Object.entries(en)) if (typeof v === 'string' && AR_RE.test(v)) wrongLang.push(`en.${k} contains ARABIC: ${v.slice(0, 40)}`);
// German umlauts/ß in en/ar values (crude but effective)
const DE_HINT = /[äöüÄÖÜß]|(?:\b(?:und|oder|nicht|bitte|Fehler|Zurück|Weiter|Speichern|Abbrechen|Bestellung|Lieferung)\b)/;
for (const [k, v] of Object.entries(en)) if (typeof v === 'string' && DE_HINT.test(v)) wrongLang.push(`en.${k} looks GERMAN: ${v.slice(0, 50)}`);
for (const [k, v] of Object.entries(ar)) if (typeof v === 'string' && /[äöüÄÖÜß]/.test(v)) wrongLang.push(`ar.${k} contains GERMAN chars: ${v.slice(0, 50)}`);
// Empty values
const empty = [];
for (const [loc, obj] of [['de', de], ['ar', ar], ['en', en]])
  for (const [k, v] of Object.entries(obj)) if (v === '' || v == null) empty.push(`${loc}.${k}`);

// ── Scan source files for hardcoded user-visible strings ──
const SRC_DIRS = ['app', 'components', 'lib'];
const SKIP = /node_modules|\.next|lib\/i18n\/locales|\.test\.|\.spec\.|scripts\//;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(p)) files.push(p);
  }
})('.');
// keep only SRC dirs
const srcFiles = files.filter((f) => SRC_DIRS.some((d) => f === d || f.startsWith(d + '/')));

const hardArabic = [];   // Arabic literals in code
const hardGerman = [];   // German literals in code
const hardEnglishJsx = []; // English text in JSX children/attrs
const fmtIssues = [];    // formatting problems

const JSX_ATTR = /(?:placeholder|title|aria-label|alt|label)\s*=\s*["']([^"']{3,})["']/g;
const JSX_TEXT = />\s*([A-Za-zÄÖÜäöüß][^<>{}\n]{2,60}?)\s*</g;
const TOAST = /(?:toast|alert|confirm)\s*\(\s*["'`]([^"'`]{3,})["'`]/g;

for (const f of srcFiles) {
  const src = fs.readFileSync(f, 'utf-8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // comments
    const loc = `${f}:${i + 1}`;
    if (AR_RE.test(line)) hardArabic.push(`${loc}: ${t.slice(0, 90)}`);
    if (/[äöüß]/.test(line) && /["'`]/.test(line)) hardGerman.push(`${loc}: ${t.slice(0, 90)}`);
    if (/\.toFixed\(2\)\s*(?:\+\s*['"]\s*€|.*€)/.test(line) || /['"`]€['"`]/.test(line) || /€\$\{/.test(line) || /\$\{[^}]*\.toFixed\(2\)\}\s*€/.test(line)) fmtIssues.push(`${loc}: hardcoded € formatting: ${t.slice(0, 80)}`);
    if (/toLocale(?:Date|Time|)String\(\s*\)/.test(line)) fmtIssues.push(`${loc}: toLocaleString() WITHOUT locale: ${t.slice(0, 80)}`);
  });
  // English JSX text + attributes (skip files that are clearly non-UI)
  if (f.endsWith('.tsx')) {
    let m;
    JSX_ATTR.lastIndex = 0;
    while ((m = JSX_ATTR.exec(src))) {
      const v = m[1];
      if (/^[A-Za-z]/.test(v) && !/^\{|^t[.(]/.test(v) && /[a-zA-Z]{3}/.test(v) && !/^(true|false|button|submit|text|email|password|tel|number|search|url|off|on|ltr|rtl|en|de|ar)$/.test(v)) {
        const ln = src.slice(0, m.index).split('\n').length;
        hardEnglishJsx.push(`${f}:${ln}: attr "${v.slice(0, 60)}"`);
      }
    }
  }
}

const report = {
  keyCounts: { de: keys.de.size, ar: keys.ar.size, en: keys.en.size, union: all.size },
  missing: { de: missing.de.length, ar: missing.ar.length, en: missing.en.length },
  missingSamples: { de: missing.de.slice(0, 15), ar: missing.ar.slice(0, 15), en: missing.en.slice(0, 15) },
  wrongLangInLocales: wrongLang.length,
  wrongLangSamples: wrongLang.slice(0, 15),
  emptyValues: empty.length,
  hardArabicInCode: hardArabic.length,
  hardGermanInCode: hardGerman.length,
  hardEnglishAttrs: hardEnglishJsx.length,
  fmtIssues: fmtIssues.length,
};
console.log(JSON.stringify(report, null, 2));
fs.writeFileSync('/tmp/i18n-full.json', JSON.stringify({ missing, wrongLang, empty, hardArabic, hardGerman, hardEnglishJsx, fmtIssues }, null, 2));
console.log('\nFull details → /tmp/i18n-full.json');
