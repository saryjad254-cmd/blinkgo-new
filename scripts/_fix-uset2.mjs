// Fix t('key.path' [, anything]) → t.key.path (object access)
// Handles t('a.b.c') and t('a.b.c', 'fallback') and t('a.b.c', {obj})
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
let total = 0;
for (const f of files) {
  let src = readFileSync(f, 'utf8');
  const before = src;

  // Match t('key.path' [followed by anything]) until the matching closing paren
  // Use a non-greedy match to find first closing paren
  src = src.replace(/\bt\(\s*'([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)'(?:\s*,[^)]*)?\s*\)/g,
    (match, key) => {
      total++;
      return `t.${key}`;
    });

  if (src !== before) {
    writeFileSync(f, src);
    console.log(`Fixed: ${f}`);
  }
}
console.log(`Total replacements: ${total}`);
