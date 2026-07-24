# Release Strategy

## Versioning

BlinkGo follows **Semantic Versioning 2.0.0** with pre-release tags:

```
vMAJOR.MINOR.PATCH[-PRERELEASE]
```

- **MAJOR**: Breaking changes (API, schema)
- **MINOR**: New features (backwards-compatible)
- **PATCH**: Bug fixes
- **PRERELEASE**: `alpha`, `beta`, `rc.N`

## Branch Strategy

| Branch | Purpose | Deploys to |
|--------|---------|-----------|
| `main` | Latest stable | Production |
| `release/v*` | Release candidate | Staging |
| `develop` | Integration | Dev |
| `feature/*` | Features | Preview |
| `hotfix/*` | Urgent fixes | Production (after main) |
| `chore/*` | Maintenance | None |

## Release Flow

```
feature → PR → main → release/v1.2.0 → RC1 → RC2 → main
```

### Hotfix Flow
```
main → hotfix/fix-X → main → tag v1.2.1 → production
```

## Tag Convention

```bash
# Stable release
git tag -a v1.2.0 -m "Release v1.2.0: New customer intelligence"
git push origin v1.2.0

# Pre-release
git tag -a v1.2.0-rc.1 -m "Release candidate 1"
git push origin v1.2.0-rc.1

# Hotfix
git tag -a v1.2.1 -m "Hotfix: Fix Stripe webhook"
git push origin v1.2.1
```

## Docker Image Tags

Each tag produces a Docker image with multiple aliases:

| Tag | Purpose | Updated |
|-----|---------|---------|
| `latest` | Latest stable | On `main` |
| `v1.2.0` | Exact version | On tag |
| `v1.2` | Major.minor | On tag |
| `v1` | Major | On tag |
| `sha-abc1234` | Commit SHA | Every build |
| `pr-42` | Pull request | On PR |

## Release Notes

Generated from conventional commits:

```bash
# Commit format
feat: add driver ETA prediction
fix: correct stripe webhook signature
perf: improve search ranking
docs: update deployment guide
chore: bump dependencies
```

## Rollback

```bash
# Roll back to previous version
kubectl rollout undo deployment/blinkgo-web

# Or specific version
kubectl set image deployment/blinkgo-web app=blinkgo/web:v1.1.9
```

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| v62 | 2026-07-17 | Phase 15: Release Candidate RC1 |
| v61 | 2026-07-17 | Phase 14: AI & Smart Operations |
| v60 | 2026-07-17 | Phase 13: Restaurant Excellence |
| v59 | 2026-07-17 | Phase 12: Driver Experience |
| v58 | 2026-07-16 | Phase 11: World-Class CX |
| v52-v57 | Earlier | Phases 4-10 |
| v1-v51 | Original | Core implementation |

## Related

- [Deployment Runbook](runbooks/DEPLOYMENT.md)
- [Service Restart Runbook](runbooks/SERVICE_RESTART.md)
- [Incident Response](runbooks/INCIDENT_RESPONSE.md)
