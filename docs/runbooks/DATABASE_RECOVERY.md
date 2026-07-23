# Database Recovery Runbook

> **When to use**: Data loss, corruption, or need to rollback to a specific point in time.

## Pre-Recovery Checklist

- [ ] Confirm recovery is necessary (not just slow queries)
- [ ] Identify target recovery time (timestamp)
- [ ] Notify all stakeholders
- [ ] Create new incident channel
- [ ] Verify backups exist and are readable

## Backup Locations

| Type | Location | Retention | RTO |
|------|----------|-----------|-----|
| **Supabase Auto** | `s3://blinkgo-db-prod/backups/` | 7 days | 5 min |
| **Supabase Manual** | `s3://blinkgo-db-manual/` | 30 days | 5 min |
| **PITR** | Supabase Point-in-Time Recovery | 7 days | 2 min |
| **Pre-migration** | `s3://blinkgo-db-pre-migration/` | 90 days | 10 min |

## List Available Backups

```bash
# Via Supabase Dashboard
# https://app.supabase.com/project/_/database/backups

# Via Supabase CLI
supabase db backups list --project-ref $PROJECT_REF

# Via API
curl -H "Authorization: Bearer $SUPABASE_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups"
```

## Restore Procedures

### Full Database Restore
```bash
# 1. Stop application traffic
kubectl scale deployment/blinkgo-web --replicas=0 -n production

# 2. Wait for connections to drain
sleep 30

# 3. Trigger restore via Supabase Dashboard
# https://app.supabase.com/project/_/database/backups
# Select backup → Restore → Confirm

# 4. Verify data
psql "$DATABASE_URL" -c "SELECT count(*) FROM orders;"
psql "$DATABASE_URL" -c "SELECT max(created_at) FROM orders;"

# 5. Restart application
kubectl scale deployment/blinko-web --replicas=3 -n production
```

### Point-in-Time Recovery (PITR)
```bash
# Via Supabase Dashboard:
# 1. Go to Database → Backups
# 2. Click "Restore to point in time"
# 3. Select timestamp (e.g., 2026-07-17 10:00:00 UTC)
# 4. Confirm restore

# The PITR will create a new database branch
# Update connection string: ?options=reference=<branch-id>
```

### Selective Table Restore
```bash
# 1. Restore full backup to temporary database
createdb blinkgo_restore

pg_restore -d blinkgo_restore /backups/blinkgo-2026-07-17.dump

# 2. Export specific table
pg_dump -t orders -t order_items blinkgo_restore > /tmp/orders.sql

# 3. Import to production (with caution!)
psql "$DATABASE_URL" < /tmp/orders.sql
```

## Verification

```bash
# Check row counts match expected
psql "$DATABASE_URL" -c "
  SELECT 'orders' as tbl, count(*) FROM orders
  UNION ALL
  SELECT 'users', count(*) FROM users
  UNION ALL
  SELECT 'restaurants', count(*) FROM restaurants
  UNION ALL
  SELECT 'order_items', count(*) FROM order_items;
"

# Verify recent data
psql "$DATABASE_URL" -c "
  SELECT id, order_number, status, created_at
  FROM orders
  ORDER BY created_at DESC
  LIMIT 10;
"
```

## Post-Recovery

- [ ] Run data integrity checks
- [ ] Verify API endpoints respond
- [ ] Test critical user flows
- [ ] Update status page
- [ ] Communicate to stakeholders
- [ ] Schedule post-mortem
- [ ] Document lessons learned

## RTO / RPO Targets

| Tier | RTO (downtime) | RPO (data loss) |
|------|----------------|-----------------|
| Tier 1 (Critical) | 5 min | 1 min |
| Tier 2 (Standard) | 30 min | 15 min |
| Tier 3 (Archive) | 4 hours | 1 hour |

## Disaster Recovery (Full Region Loss)

```bash
# 1. Spin up new Supabase project
# https://app.supabase.com → New project

# 2. Restore latest backup to new project
# (use Supabase CLI or Dashboard)

# 3. Update DNS to point to new region
# (or use failover via Cloudflare)

# 4. Update environment variables
kubectl set env deployment/blinkgo-web -n production \
  NEXT_PUBLIC_SUPABASE_URL=$NEW_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY=$NEW_SERVICE_ROLE

# 5. Trigger rolling restart
kubectl rollout restart deployment/blinkgo-web -n production
```

## Related Runbooks

- [Service Restart](SERVICE_RESTART.md)
- [Incident Response](INCIDENT_RESPONSE.md)
- [High Traffic](HIGH_TRAFFIC.md)
