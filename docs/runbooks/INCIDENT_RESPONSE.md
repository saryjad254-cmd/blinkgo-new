# Incident Response Runbook

> **When to use this**: Production incident, service degradation, or outage detected.

## Severity Classification

| Level | Definition | Response Time | Escalation |
|-------|-----------|---------------|------------|
| **P0** | Complete outage, data loss, security breach | Immediate | All hands + CEO |
| **P1** | Major feature broken, >25% users affected | < 15 min | On-call + Manager |
| **P2** | Minor feature broken, <25% users | < 1 hour | On-call |
| **P3** | Cosmetic issue, workaround exists | < 1 day | Next business day |

## Response Procedure

### 1. Acknowledge (T+0)
- [ ] Page acknowledged in PagerDuty
- [ ] Create incident channel: `#incident-YYYYMMDD-HHMM`
- [ ] Assign Incident Commander
- [ ] Open status page: https://status.blinkgo.com

### 2. Assess (T+5)
- [ ] Check health: `curl https://app.blinkgo.com/api/health`
- [ ] Check logs: `kubectl logs -n production -l app=blinkgo --tail=200`
- [ ] Check metrics: https://grafana.blinkgo.com/d/blinkgo
- [ ] Check recent deploys: `kubectl rollout history deployment/blinkgo-web`

### 3. Mitigate (T+15)
**Choose the fastest path to recovery:**

```bash
# Rollback to previous version
kubectl rollout undo deployment/blinkgo-web -n production

# Scale up
kubectl scale deployment/blinkgo-web --replicas=10 -n production

# Restart all pods
kubectl rollout restart deployment/blinkgo-web -n production

# Enable maintenance mode
curl -X POST https://app.blinkgo.com/api/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": true, "message": "We are investigating an issue"}'
```

### 4. Communicate (T+ongoing)
- [ ] Status page update every 30 min
- [ ] Customer support briefing
- [ ] Internal stakeholder updates
- [ ] Final resolution notice

### 5. Post-Mortem (T+72h)
- [ ] Schedule post-mortem meeting
- [ ] Write timeline document
- [ ] Identify root cause
- [ ] Action items with owners
- [ ] Update this runbook

## Common Scenarios

### Database Connection Pool Exhausted
```bash
# Check current connections
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '5 minutes';"

# Restart app pods
kubectl rollout restart deployment/blinkgo-web -n production
```

### High Memory Usage
```bash
# Identify top consumers
kubectl top pods -n production

# Get heap dump from specific pod
POD=$(kubectl get pod -n production -l app=blinkgo -o name | head -1)
kubectl exec -n production $POD -- node -e "require('v8').writeHeapSnapshot('/tmp/heap-' + Date.now() + '.heapsnapshot')"

# Restart affected pod
kubectl delete pod -n production $POD
```

### Stripe Webhook Failures
```bash
# Check webhook logs
grep "stripe" /var/log/blinkgo/app.log | tail -50

# Replay webhooks via Stripe Dashboard
# https://dashboard.stripe.com/webhooks

# Verify webhook endpoint
curl -X POST https://app.blinkgo.com/api/stripe/webhook \
  -H "stripe-signature: test" \
  -d '{}' -w "%{http_code}\n"
```

## Contact Information

| Role | Primary | Backup |
|------|---------|--------|
| On-call Engineer | PagerDuty | oncall@blinkgo.com |
| Platform Lead | +49 123 456 7890 | platform@blinkgo.com |
| Security | security@blinkgo.com | +49 123 456 7891 |
| Supabase Support | support@supabase.com | (Pro plan) |
| Stripe Support | support@stripe.com | (Business hours) |
