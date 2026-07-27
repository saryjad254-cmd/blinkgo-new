/**
 * v40 — Comprehensive Test Runner
 * ────────────────────────────────
 * Runs all v40 test suites in sequence, with throttling between them
 * to avoid rate-limit interference.
 */

const { spawn } = require('child_process');
const path = require('path');

const SUITES = [
  { name: 'Customer Journey',  file: 'customer-journey-test.js',  count: 29 },
  { name: 'Driver Stress',     file: 'driver-stress-test.js',     count: 23 },
  { name: 'Restaurant Workflow', file: 'restaurant-workflow-test.js', count: 18 },
  { name: 'Admin Workflow',    file: 'admin-workflow-test.js',    count: 24 },
  { name: 'Edge Cases',        file: 'edge-cases-test.js',        count: 20 },
  { name: 'Performance',       file: 'performance-test.js',       count: 10 },
];

const THROTTLE_MS = 15_000; // 15s between suites to let rate limits clear

async function runSuite(suite) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(60)}\n  ${suite.name}  (expect ${suite.count} tests)\n${'═'.repeat(60)}\n`);
    const start = Date.now();
    const proc = spawn('node', [path.join('scripts', suite.file)], { stdio: 'inherit' });
    proc.on('exit', (code) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\n  ${suite.name}: ${code === 0 ? 'PASS' : 'FAIL'} (${elapsed}s)`);
      resolve(code);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v40 COMPREHENSIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Suites: ${SUITES.length}`);
  console.log(`  Throttle: ${THROTTLE_MS / 1000}s between suites`);
  console.log('═══════════════════════════════════════════════════════════');

  const results = [];
  for (let i = 0; i < SUITES.length; i++) {
    const suite = SUITES[i];
    const code = await runSuite(suite);
    results.push({ name: suite.name, pass: code === 0 });
    if (i < SUITES.length - 1) {
      console.log(`\n  ⏸  Throttling ${THROTTLE_MS / 1000}s to let rate limits clear...`);
      await sleep(THROTTLE_MS);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
  }
  const allPass = results.every((r) => r.pass);
  console.log('\n  Overall: ' + (allPass ? 'PASS' : 'FAIL'));
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(allPass ? 0 : 1);
}

run();
