# Deployment Runbook

> **When to use**: Standard production deployments, hotfixes, rollbacks.

## Pre-Deployment Checklist

- [ ] All tests pass (`npm test`)
- [ ] TypeScript clean (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] CHANGELOG updated
- [ ] Version bumped in `package.json`
- [ ] PR reviewed and approved
- [ ] No pending security alerts
- [ ] Database migrations reviewed (if any)

## Deployment Methods

### Method 1: Git Push (CI/CD)
```bash
git push origin main
# GitHub Actions automatically:
# 1. Runs tests
# 2. Builds Docker image
# 3. Pushes to registry
# 4. Triggers rolling deploy
# 5. Smoke tests
```

### Method 2: Manual Docker Build
```bash
# Build image
docker build -t blinkgo/web:$VERSION \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg COMMIT_SHA=$(git rev-parse HEAD) \
  --build-arg VERSION=$VERSION .

# Push to registry
docker push blinkgo/web:$VERSION

# Update deployment
kubectl set image deployment/blinkgo-web -n production \
  app=blinkgo/web:$VERSION

# Watch rollout
kubectl rollout status deployment/blinkgo-web -n production
```

### Method 3: Vercel Deploy
```bash
vercel --prod

# Or via Git push (auto-deploys on main)
git push origin main
```

## Zero-Downtime Deployment

The deployment uses `RollingUpdate` strategy with:
- `maxSurge: 1` (one extra pod during deploy)
- `maxUnavailable: 0` (no pods removed until new ones are ready)

This ensures:
1. Old version continues serving traffic
2. New version is deployed
3. Health checks pass on new pod
4. Traffic shifts to new pod
5. Old pod is terminated

## Post-Deployment Verification

```bash
# 1. All pods healthy
kubectl get pods -n production -l app=blinkgo

# 2. Liveness probes passing
for i in $(kubectl get pod -n production -l app=blinkgo -o name); do
  echo -n "$i: "
  kubectl exec -n production $i -- wget -q -O- http://localhost:3000/api/health/live || echo "FAIL"
done

# 3. Readiness probes passing
for i in $(kubectl get pod -n production -l app=blinkgo -o name); do
  echo -n "$i: "
  kubectl exec -n production $i -- wget -q -O- http://localhost:3000/api/health/ready || echo "FAIL"
done

# 4. Critical user flows
./scripts/smoke-test.sh

# 5. Check metrics
curl http://localhost:3000/api/metrics | head
```

## Rollback

### Quick Rollback (Previous Version)
```bash
# Kubernetes
kubectl rollout undo deployment/blinkgo-web -n production

# Verify
kubectl rollout status deployment/blinkgo-web -n production
```

### Rollback to Specific Version
```bash
# List revisions
kubectl rollout history deployment/blinkgo-web -n production

# Rollback to specific
kubectl rollout undo deployment/blinkgo-web -n production --to-revision=5
```

### Database Migration Rollback
```bash
# Run reverse migration
psql "$DATABASE_URL" < migrations/reverse/2026_07_17_revert.sql

# (Always test rollback migrations in staging first!)
```

## Deployment Strategy

### Blue-Green (for risky deploys)
```bash
# Deploy to "green" environment
kubectl apply -f deployment-green.yml

# Test
./scripts/smoke-test.sh --target=green

# Switch traffic
kubectl patch service blinkgo-web -n production \
  -p '{"spec":{"selector":{"version":"green"}}}'

# Rollback: switch back
kubectl patch service blinkgo-web -n production \
  -p '{"spec":{"selector":{"version":"blue"}}}'
```

### Canary (5% traffic)
```bash
# Deploy canary with 5% traffic
kubectl apply -f canary.yml

# Monitor metrics for 30 min
./scripts/monitor-canary.sh

# If good, scale up
kubectl scale deployment/blinkgo-canary --replicas=3

# If bad, remove
kubectl delete deployment/blinkgo-canary
```

## Version Tagging

```bash
# Tag the release
git tag -a v1.2.3 -m "Release v1.2.3: Feature X"
git push origin v1.2.3

# Docker
docker tag blinkgo/web:1.2.3 blinkgo/web:stable
docker push blinkgo/web:stable
```

## Related

- [Incident Response](INCIDENT_RESPONSE.md)
- [Service Restart](SERVICE_RESTART.md)
- [High Traffic](HIGH_TRAFFIC.md)
