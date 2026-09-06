import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.next-test',
  '.next-push',
  'node_modules',
  'artifacts',
  'reports',
  'test-results',
]);
const scannedExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.scss', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);

const patterns = [
  ['Google API key', new RegExp('AI' + 'za[0-9A-Za-z_-]{20,}', 'g')],
  ['Supabase secret key', new RegExp('sb_' + 'secret_[0-9A-Za-z_-]{16,}', 'g')],
  ['Stripe live secret', new RegExp('sk_' + 'live_[0-9A-Za-z]{16,}', 'g')],
  ['Stripe webhook secret', new RegExp('wh' + 'sec_[0-9A-Za-z]{16,}', 'g')],
  ['GitHub token', new RegExp('gh' + '[pousr]_[0-9A-Za-z]{30,}', 'g')],
  ['AWS access key', new RegExp('AK' + 'IA[0-9A-Z]{16}', 'g')],
  ['Private key material', new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----', 'g')],
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.env')) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Next.js can use custom dist directories for isolated acceptance runs.
      // Those are generated bundles, not tracked source, and public browser
      // configuration (such as Maps keys) is expected to be compiled there.
      const generatedNextDirectory = entry.name === '.next' || entry.name.startsWith('.next-');
      if (!ignoredDirectories.has(entry.name) && !generatedNextDirectory) files.push(...await collectFiles(absolutePath));
      continue;
    }
    if (scannedExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolutePath);
  }

  return files;
}

const findings = [];
for (const file of await collectFiles(root)) {
  const content = await readFile(file, 'utf8');
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({ file: path.relative(root, file), label, line });
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.label})`);
  }
  process.exit(1);
}

console.log('Secret scan passed: no production-shaped secrets found in tracked source files.');
