import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.staging.local', override: true });
// Operational secrets are generated per developer/staging environment and
// intentionally kept separate from provider credentials. The file is ignored
// by Git and excluded from clean delivery archives.
dotenv.config({ path: '.env.staging.secrets.local', override: true });

const expectedRef = 'egjehqoilbjvzgbnksds';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!supabaseUrl.includes(expectedRef)) {
  throw new Error(`Refusing to start: .env.staging.local is not ${expectedRef}`);
}

const port = process.env.BLINKGO_STAGING_PORT ?? '3100';
const nextBin = new URL('../node_modules/next/dist/bin/next', import.meta.url);
const child = spawn(process.execPath, [nextBin.pathname.slice(1), 'dev', '--port', port], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    // Keep staging compilation and route manifests isolated from the local
    // mock harness. Reusing `.next` across the two environments can leave a
    // stale App Router manifest (for example API auth routes resolving as the
    // not-found page after switching servers).
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-staging',
    // Allows the loopback-only demo harness to target this one staging
    // project. Production still fails closed and arbitrary remote projects
    // are never accepted.
    BLINKGO_STAGING_PROJECT_REF: expectedRef,
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
