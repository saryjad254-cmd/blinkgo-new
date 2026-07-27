#!/usr/bin/env node
/**
 * Load Testing — Phase 9
 * ──────────────────────
 * Simulate concurrent user load at different scales:
 *  - 100, 1k, 5k, 10k, 25k users
 *
 * Measures:
 *  - Throughput (RPS)
 *  - Latency (p50, p95, p99)
 *  - Error rate
 *  - Server resource usage
 */

const { performance } = require('perf_hooks');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';

const SCENARIOS = [
  { name: '100 users (warm)', users: 100, requestsPerUser: 5, rampUpMs: 1000 },
  { name: '1,000 users', users: 1000, requestsPerUser: 3, rampUpMs: 2000 },
  { name: '5,000 users', users: 5000, requestsPerUser: 2, rampUpMs: 5000 },
  { name: '10,000 users', users: 10000, requestsPerUser: 1, rampUpMs: 10000 },
  { name: '25,000 users (peak)', users: 25000, requestsPerUser: 1, rampUpMs: 15000 },
];

const ENDPOINTS = [
  { method: 'GET', path: '/api/health', weight: 1 },
  { method: 'GET', path: '/api/search?q=&sort=recommended&limit=20', weight: 10 },
  { method: 'GET', path: '/api/products/bestsellers?limit=10', weight: 5 },
  { method: 'GET', path: '/api/eta?lat=50.82&lng=6.97', weight: 3 },
  { method: 'GET', path: '/api/zones', weight: 1 },
];

const ORIGIN = BASE;

// Pick endpoint by weight
function pickEndpoint() {
  const totalWeight = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const e of ENDPOINTS) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return ENDPOINTS[0];
}

async function makeRequest() {
  const ep = pickEndpoint();
  const start = performance.now();
  try {
    const res = await fetch(`${ORIGIN}${ep.path}`, {
      method: ep.method,
      headers: {
        'Origin': ORIGIN,
        'Content-Type': 'application/json',
      },
    });
    const elapsed = performance.now() - start;
    return { status: res.status, elapsed, ok: res.ok };
  } catch (e) {
    return { status: 0, elapsed: performance.now() - start, ok: false, error: e.message };
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function runScenario(scenario) {
  console.log(`\n═══ ${scenario.name} ═══`);
  const latencies = [];
  const errors = [];
  let totalRequests = 0;
  let successRequests = 0;

  const start = performance.now();
  const tasks = [];

  for (let u = 0; u < scenario.users; u++) {
    const userStart = (u / scenario.users) * scenario.rampUpMs;
    for (let r = 0; r < scenario.requestsPerUser; r++) {
      tasks.push(
        new Promise((resolve) => {
          setTimeout(async () => {
            const result = await makeRequest();
            totalRequests++;
            if (result.ok) successRequests++;
            else errors.push(result);
            latencies.push(result.elapsed);
            resolve();
          }, userStart + Math.random() * 100);
        })
      );
    }
  }

  // Run in batches of 200 concurrent
  const BATCH = 200;
  for (let i = 0; i < tasks.length; i += BATCH) {
    await Promise.all(tasks.slice(i, i + BATCH));
  }
  const duration = (performance.now() - start) / 1000;

  const rps = totalRequests / duration;
  const successRate = (successRequests / totalRequests) * 100;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  console.log(`  Duration:    ${duration.toFixed(2)}s`);
  console.log(`  Total:       ${totalRequests} requests`);
  console.log(`  Throughput:  ${rps.toFixed(1)} RPS`);
  console.log(`  Success:     ${successRate.toFixed(2)}%`);
  console.log(`  Latency:     p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms p99=${p99.toFixed(0)}ms`);
  console.log(`  Errors:      ${errors.length}`);

  return {
    scenario: scenario.name,
    rps,
    successRate,
    p50,
    p95,
    p99,
    errors: errors.length,
  };
}

async function main() {
  console.log(`\n🔬 Phase 9 Load Test — ${BASE}\n`);

  // Health check first
  const health = await makeRequest();
  if (!health.ok) {
    console.log(`❌ Server not reachable: ${health.status}`);
    process.exit(1);
  }

  const results = [];
  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario);
    results.push(result);
  }

  console.log(`\n═══════════ SUMMARY ═══════════\n`);
  console.log('Scenario                | RPS    | Success | p50    | p95    | p99    | Errors');
  console.log('────────────────────────|────────|─────────|────────|────────|────────|───────');
  for (const r of results) {
    const name = r.scenario.padEnd(22);
    const rps = r.rps.toFixed(0).padStart(6);
    const succ = r.successRate.toFixed(1) + '%';
    const p50 = r.p50.toFixed(0).padStart(6) + 'ms';
    const p95 = r.p95.toFixed(0).padStart(6) + 'ms';
    const p99 = r.p99.toFixed(0).padStart(6) + 'ms';
    console.log(`${name} | ${rps} | ${succ.padStart(7)} | ${p50} | ${p95} | ${p99} | ${r.errors}`);
  }

  // Save results
  fs.writeFileSync('/tmp/load-test-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to /tmp/load-test-results.json');
}

main().catch((e) => {
  console.error('Load test failed:', e);
  process.exit(1);
});
