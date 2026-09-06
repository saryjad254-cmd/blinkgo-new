#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = resolve(process.argv[2] || join(dirname(root), 'blinkgo-final-fixed.zip'));
const staging = join(dirname(output), '.blinkgo-delivery-staging');

const excludedDirectories = new Set([
  '.git', '.next', '.next-email-test', '.next-push', '.next-suite-test', '.next-test',
  '.turbo', '.vercel', 'artifacts', 'coverage', 'node_modules', 'screenshots',
]);
const excludedFiles = new Set([
  '.codex-eslint.json', '.tmp-cookies.txt', '.tmp-headers.txt', 'tsconfig.tsbuildinfo',
]);

function shouldExclude(sourcePath) {
  const name = basename(sourcePath);
  const pathFromRoot = relative(root, sourcePath).split(sep).join('/');
  if (name.startsWith('.next') && statSync(sourcePath).isDirectory()) return true;
  if (excludedDirectories.has(name) && statSync(sourcePath).isDirectory()) return true;
  if (excludedFiles.has(name)) return true;
  if (pathFromRoot === 'reports' && statSync(sourcePath).isDirectory()) return true;
  if (/^\.env(?:\..+)?$/.test(name) && name !== '.env.example') return true;
  if (/\.(?:log|zip)$/i.test(name)) return true;
  if (pathFromRoot.startsWith('supabase/.temp/') || pathFromRoot.startsWith('supabase/.branches/')) return true;
  return false;
}

function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    if (shouldExclude(sourcePath)) continue;
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else cpSync(sourcePath, destinationPath);
  }
}

if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
if (existsSync(output)) rmSync(output, { force: true });

const packageRoot = join(staging, 'blinkgo-final-fixed');
copyTree(root, packageRoot);

execFileSync('tar.exe', [
  '-a', '-c', '-f', output, '-C', staging, 'blinkgo-final-fixed',
], { stdio: 'inherit' });

rmSync(staging, { recursive: true, force: true });
console.log(`Clean delivery created: ${output}`);
