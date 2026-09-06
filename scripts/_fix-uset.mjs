// Fix t('key.path') to t.key.path in files with useT() object pattern
// Only converts t(...) calls where t is a known object from useT/useI18n
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
for (const f of files) {
  let src = readFileSync(f, 'utf8');
  const before = src;

  // Match t('key.path') and t('key.path', 'fallback')
  // Avoid matching in comments, strings, etc. — be conservative
  src = src.replace(/\bt\(\s*'([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)'\s*(?:,\s*'[^']*')?\s*\)/g,
    (match, key) => `t.${key.replace(/\./g, '.')}`);

  if (src !== before) {
    writeFileSync(f, src);
    console.log(`Fixed: ${f}`);
  } else {
    console.log(`No changes: ${f}`);
  }
}
