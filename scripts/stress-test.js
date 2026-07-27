/**
 * Stress Test — High Concurrency
 * Run: node scripts/stress-test.js
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TOTAL_REQUESTS = parseInt(process.env.TOTAL || '100');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20');

const endpoints = [
  { path: '/api/health',              weight: 20, method: 'GET' },
  { path: '/api/announcements',       weight: 10, method: 'GET' },
  { path: '/api/search',              weight: 25, method: 'GET' },
  { path: '/api/products/bestsellers', weight: 15, method: 'GET' },
  { path: '/api/products/recent',     weight: 10, method: 'GET' },
  { path: '/',                        weight: 5,  method: 'GET' },
  { path: '/welcome',                 weight: 5,  method: 'GET' },
  { path: '/login',                   weight: 5,  method: 'GET' },
];

function pickEndpoint() {
  const totalWeight = endpoints.reduce(function(s, e) { return s + e.weight; }, 0);
  let r = Math.random() * totalWeight;
  for (const e of endpoints) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return endpoints[0];
}

const results = [];
let nextIndex = 0;
const startTime = Date.now();

async function makeRequest() {
  const idx = nextIndex++;
  if (idx >= TOTAL_REQUESTS) return;

  const endpoint = pickEndpoint();
  const start = Date.now();
  try {
    const res = await fetch(BASE + endpoint.path, {
      method: endpoint.method,
      headers: { 'Accept': 'application/json' },
    });
    const ms = Date.now() - start;
    results.push({ path: endpoint.path, status: res.status, ms: ms, ok: res.ok });
  } catch (err) {
    const ms = Date.now() - start;
    results.push({ path: endpoint.path, status: 0, ms: ms, ok: false });
  }

  if (nextIndex < TOTAL_REQUESTS) {
    makeRequest();
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Stress Test');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Total requests: ' + TOTAL_REQUESTS);
  console.log('  Concurrency:    ' + CONCURRENCY);
  console.log('  Base:           ' + BASE);
  console.log('');

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, TOTAL_REQUESTS); i++) {
    workers.push(makeRequest());
  }
  await Promise.all(workers);

  const totalMs = Date.now() - startTime;
  const rps = (TOTAL_REQUESTS / totalMs) * 1000;
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.reduce((s, n) => s + n, 0) / latencies.length;

  const byEndpoint = {};
  for (const r of results) {
    if (!byEndpoint[r.path]) byEndpoint[r.path] = { count: 0, ok: 0, ms: [] };
    byEndpoint[r.path].count++;
    if (r.ok) byEndpoint[r.path].ok++;
    byEndpoint[r.path].ms.push(r.ms);
  }

  console.log('  RESULTS');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log('  Total time:      ' + totalMs + 'ms');
  console.log('  Requests/sec:    ' + rps.toFixed(1));
  console.log('  Successful:      ' + ok + '/' + TOTAL_REQUESTS + ' (' + ((ok/TOTAL_REQUESTS*100).toFixed(1)) + '%)');
  console.log('  Failed:          ' + failed);
  console.log('');
  console.log('  Latency p50:     ' + p50 + 'ms');
  console.log('  Latency p95:     ' + p95 + 'ms');
  console.log('  Latency p99:     ' + p99 + 'ms');
  console.log('  Latency avg:     ' + Math.round(avg) + 'ms');
  console.log('');
  console.log('  Per-endpoint:');
  const sorted = Object.entries(byEndpoint).sort((a, b) => b[1].count - a[1].count);
  for (const [path, stats] of sorted) {
    const sortedMs = stats.ms.sort((a, b) => a - b);
    const p95ep = sortedMs[Math.floor(sortedMs.length * 0.95)] || 0;
    const paddedPath = path.padEnd(35);
    console.log('    ' + paddedPath + ' ' + String(stats.count).padStart(4) + ' req, ' + String(stats.ok).padStart(3) + ' ok, p95 ' + p95ep + 'ms');
  }
  console.log('');

  const pass = ok === TOTAL_REQUESTS && p95 < 5000;
  console.log(pass ? '  PASS' : '  FAIL');
  process.exit(pass ? 0 : 1);
})();
