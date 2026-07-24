# High Traffic Event Runbook

> **When to use**: Marketing campaign, viral event, news coverage, or unusual traffic spike.

## Pre-Event Preparation

### 1. Capacity Planning
- Calculate expected peak (3-5x normal)
- Scale up before event: `kubectl scale deployment/blinkgo-web --replicas=10`
- Pre-warm caches: `curl -X POST .../api/admin/cache/warm`
- Test at expected load: `node scripts/load-test.js --users=10000`

### 2. Database Preparation
- Increase connection pool size
- Verify read replicas are synced
- Pre-aggregate analytics (cron: `0 */6 * * * /scripts/precompute.sh`)
- Add missing indexes: `psql ... < migrations/perf-indexes.sql`

### 3. Cache Strategy
- Increase cache TTL for static content
- Pre-cache top 100 restaurants
- Pre-cache category pages
- Pre-cache search autocomplete

## During Spike

### Auto-Scaling Response
HPA should handle this automatically:
- **CPU > 70%**: scales up
- **Memory > 80%**: scales up
- **Max replicas**: 20 (configurable)

### Manual Scaling
```bash
# If auto-scaling is too slow
kubectl scale deployment/blinkgo-web --replicas=15 -n production

# Watch rollout
kubectl rollout status deployment/blinkgo-web -n production

# Monitor
watch -n 5 'kubectl top pods -n production'
```

### Rate Limiting Adjustments
```bash
# Temporarily increase rate limits (if needed)
# Edit ConfigMap:
kubectl edit configmap blinkgo-config -n production
# Set: RATE_LIMIT_REQUESTS=200 (from 100)

# Restart to apply
kubectl rollout restart deployment/blinkgo-web -n production
```

### Cost Optimization During Spike
- **Reduce image quality**: Serve WebP only (skip AVIF for 24h)
- **Disable non-critical features**: Analytics, recommendations
- **Defer non-urgent work**: Background jobs, email sending
- **Use CDN aggressively**: Cache HTML for 30s instead of 0s

## Monitoring

### Key Metrics to Watch
```promql
# Request rate
rate(http_requests_total[1m])

# Error rate
rate(http_errors_total[5m]) / rate(http_requests_total[5m])

# p95 latency
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Active connections
active_connections

# Database queries/sec
rate(db_queries_total[1m])

# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))
```

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 2% | > 5% |
| p95 latency | > 1s | > 3s |
| CPU | > 80% | > 95% |
| Memory | > 85% | > 95% |
| DB connections | > 80% | > 95% |

## Communication

### Internal
- Update #status every 15 minutes
- Notify leadership of sustained >2x normal traffic
- Coordinate with marketing on customer messaging

### External
- Status page: https://status.blinkgo.com
- Twitter: @blinkgo
- In-app banner if degraded

## Post-Event

- [ ] Scale back down: `kubectl scale deployment/blinkgo-web --replicas=3`
- [ ] Review metrics for capacity planning
- [ ] Identify any new bottlenecks
- [ ] Update this runbook
- [ ] Schedule post-event review
