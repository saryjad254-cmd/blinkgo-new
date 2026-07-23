# Service Restart Runbook

> **When to use**: Planned restart, memory leak, stuck pod, or after config change.

## Pre-Restart Checklist

- [ ] Verify reason for restart (logs, metrics)
- [ ] Notify team in #platform
- [ ] Check for in-flight transactions
- [ ] Verify DB connection pool is healthy
- [ ] Confirm backup is recent (within 1 hour)

## Restart Procedures

### Single Pod (Zero-Downtime)
```bash
# Identify the pod
POD=$(kubectl get pod -n production -l app=blinkgo -o name | head -1)

# Graceful delete (replacement pod scheduled automatically)
kubectl delete pod -n production $POD --grace-period=30

# Verify replacement is healthy
kubectl get pod -n production $POD -w
```

### Rolling Restart (All Pods)
```bash
# Trigger rolling update
kubectl rollout restart deployment/blinkgo-web -n production

# Watch progress
kubectl rollout status deployment/blinkgo-web -n production
```

### Docker Compose
```bash
cd /opt/blinkgo
docker compose restart app

# Verify
docker compose ps
docker compose logs app --tail=50
```

### Direct Process
```bash
# Find PID
ps aux | grep "next start"

# Send SIGTERM (graceful)
kill -TERM <PID>

# Wait 30s, check if still alive
ps -p <PID>

# Force kill if needed
kill -9 <PID>

# Restart
cd /opt/blinkgo
nohup npm start > /var/log/blinkgo/app.log 2>&1 &
```

## Post-Restart Verification

```bash
# 1. Liveness check
curl -f http://localhost:3000/api/health/live

# 2. Readiness check
curl -f http://localhost:3000/api/health/ready

# 3. Full health check
curl http://localhost:3000/api/health | jq

# 4. Verify metrics scraping
curl http://localhost:3000/api/metrics/prometheus | head

# 5. Test critical path
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"test"}' -w "%{http_code}\n"
```

## Expected Timeline

- Single pod restart: 30-60 seconds
- Full rolling restart: 2-3 minutes
- Cold start (cache miss): +30 seconds

## Rollback if Restart Fails

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/blinkgo-web -n production

# Or rollback to specific revision
kubectl rollout undo deployment/blinkgo-web -n production --to-revision=3
```

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pod stuck in `Terminating` | Finalizer issue | `kubectl delete pod --force --grace-period=0` |
| CrashLoopBackOff | Bad config/DB issue | `kubectl logs` + `kubectl describe pod` |
| ImagePullBackOff | Registry auth | Check `imagePullSecrets` |
| Readiness probe fails | DB or cache issue | Check `/api/health/ready` |
