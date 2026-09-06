#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS CLI */
'use strict';

/**
 * Bounded read-only load test for BlinkGo.
 *
 * Safety rules:
 * - remote targets require ALLOW_REMOTE_LOAD_TEST=true;
 * - only idempotent public GET endpoints are exercised;
 * - concurrency is implemented by a worker pool, not unbounded timers;
 * - every request has a deadline and every profile has explicit thresholds.
 */

const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const baseUrl = new URL(process.env.BASE_URL || process.env.BASE || 'http://localhost:3000');
const profileName = (process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1] || 'smoke').toLowerCase();
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const requestTimeoutMs = Number(process.env.LOAD_REQUEST_TIMEOUT_MS || 8_000);

const profiles = {
  smoke: [
    { name: 'warm public reads', requests: 60, concurrency: 6, p95Ms: 2_500, minSuccessRate: 99 },
  ],
  baseline: [
    { name: 'normal traffic', requests: 500, concurrency: 20, p95Ms: 2_000, minSuccessRate: 99 },
    { name: 'busy traffic', requests: 1_000, concurrency: 40, p95Ms: 2_500, minSuccessRate: 99 },
  ],
  peak: [
    { name: 'peak read traffic', requests: 5_000, concurrency: 100, p95Ms: 3_000, minSuccessRate: 99 },
  ],
};

const endpoints = [
  { path: '/api/search?q=&sort=recommended&limit=20', weight: 10 },
  { path: '/api/products/bestsellers?limit=10', weight: 5 },
  { path: '/api/eta?from=50.82,6.97&to=50.81,7.01', weight: 3 },
  { path: '/api/zones', weight: 1 },
  { path: '/api/health/live', weight: 1 },
];

function isLocalTarget(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function assertSafeTarget() {
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error(`Unsupported target protocol: ${baseUrl.protocol}`);
  }
  if (!isLocalTarget(baseUrl) && process.env.ALLOW_REMOTE_LOAD_TEST !== 'true') {
    throw new Error('Remote load testing is disabled. Set ALLOW_REMOTE_LOAD_TEST=true only for an approved staging target.');
  }
  if (!profiles[profileName]) {
    throw new Error(`Unknown profile "${profileName}". Use smoke, baseline, or peak.`);
  }
  if (profileName === 'peak' && process.env.ALLOW_PEAK_LOAD_TEST !== 'true') {
    throw new Error('Peak profile requires ALLOW_PEAK_LOAD_TEST=true.');
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 500 || requestTimeoutMs > 60_000) {
    throw new Error('LOAD_REQUEST_TIMEOUT_MS must be between 500 and 60000.');
  }
}

function chooseEndpoint(index) {
  const totalWeight = endpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);
  let cursor = index % totalWeight;
  for (const endpoint of endpoints) {
    if (cursor < endpoint.weight) return endpoint;
    cursor -= endpoint.weight;
  }
  return endpoints[0];
}

async function request(endpoint, virtualUser = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const headers = { Accept: 'application/json', 'User-Agent': 'BlinkGo-Load-Test/1.0' };
    // RFC 5737 TEST-NET-2 addresses model separate local clients without
    // forwarding a spoofed address to any remote environment.
    if (isLocalTarget(baseUrl)) headers['X-Forwarded-For'] = `198.51.100.${(virtualUser % 200) + 1}`;
    const response = await fetch(new URL(endpoint.path, baseUrl), {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      path: endpoint.path.split('?')[0],
      status: response.status,
      ok: response.ok,
      latencyMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      path: endpoint.path.split('?')[0],
      status: 0,
      ok: false,
      latencyMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(quantile * ordered.length) - 1)];
}

async function runScenario(scenario) {
  const results = new Array(scenario.requests);
  let nextIndex = 0;
  const startedAt = performance.now();

  async function worker(workerIndex) {
    while (true) {
      const index = nextIndex++;
      if (index >= scenario.requests) return;
      results[index] = await request(chooseEndpoint(index), workerIndex);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(scenario.concurrency, scenario.requests) },
      (_, workerIndex) => worker(workerIndex),
    ),
  );

  const durationSeconds = (performance.now() - startedAt) / 1_000;
  const latencies = results.map((result) => result.latencyMs);
  const successful = results.filter((result) => result.ok).length;
  const successRate = (successful / results.length) * 100;
  const statusCounts = Object.fromEntries(
    [...new Set(results.map((result) => result.status))]
      .sort((left, right) => left - right)
      .map((status) => [String(status), results.filter((result) => result.status === status).length]),
  );
  const summary = {
    scenario: scenario.name,
    requests: results.length,
    concurrency: scenario.concurrency,
    durationSeconds: Number(durationSeconds.toFixed(3)),
    requestsPerSecond: Number((results.length / durationSeconds).toFixed(2)),
    successRate: Number(successRate.toFixed(2)),
    p50Ms: Number(percentile(latencies, 0.5).toFixed(1)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(1)),
    p99Ms: Number(percentile(latencies, 0.99).toFixed(1)),
    statusCounts,
    thresholds: { minSuccessRate: scenario.minSuccessRate, p95Ms: scenario.p95Ms },
    passed: successRate >= scenario.minSuccessRate && percentile(latencies, 0.95) <= scenario.p95Ms,
  };

  console.log(`${summary.passed ? 'PASS' : 'FAIL'} ${summary.scenario}: ${summary.requestsPerSecond} req/s, ${summary.successRate}% success, p95 ${summary.p95Ms}ms`);
  return summary;
}

async function main() {
  assertSafeTarget();
  const health = await request({ path: '/api/health/live' });
  if (!health.ok) throw new Error(`Target health check failed with status ${health.status}.`);

  console.log(`BlinkGo bounded load test: ${profileName} -> ${baseUrl.origin}`);
  const scenarioResults = [];
  for (const scenario of profiles[profileName]) scenarioResults.push(await runScenario(scenario));

  const report = {
    generatedAt: new Date().toISOString(),
    target: baseUrl.origin,
    profile: profileName,
    requestTimeoutMs,
    passed: scenarioResults.every((result) => result.passed),
    scenarios: scenarioResults,
  };
  const outputPath = path.resolve(outputArg || path.join(os.tmpdir(), `blinkgo-load-${profileName}.json`));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Report: ${outputPath}`);
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((error) => {
  console.error(`Load test aborted: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
