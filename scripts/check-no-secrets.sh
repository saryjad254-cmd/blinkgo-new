#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Pre-commit / CI hook: check for real secrets in the repository
# ═══════════════════════════════════════════════════════════════
# Defense-in-depth (audit finding F-01).
# Even though .env is in .gitignore and .dockerignore, an operator could
# still `git add -f .env` or paste a key into a tracked file. This script
# is the last line of defense — it grep-rejects the commit / build.
#
# Install as a pre-commit hook:
#   cp scripts/check-no-secrets.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or run in CI:
#   ./scripts/check-no-secrets.sh
#
# The script also ignores the file itself (it contains the patterns) and
# the operator secrets-rotation helper.
# ═══════════════════════════════════════════════════════════════

set -e

# Pattern: GitHub Secret Scanning + a raw JWT-prefix match (eyJ)
# so we catch accidentally committed access_token / refresh_token blobs.
PATTERN='sb_secret_[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|pk_live_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}'

# Use git ls-files when available so we ONLY check tracked files
# (untracked .env is intentionally on disk at runtime — .gitignore does
#  its job, and we don't want a false positive from it).
if [ -d .git ] && command -v git > /dev/null 2>&1; then
  # shellcheck disable=SC2086
  matches=$(git ls-files \
    | grep -vE '(^\.gitignore|^\.dockerignore|^check-no-secrets\.sh$|^remove-secrets-from-history\.sh$)' \
    | xargs grep -nE "$PATTERN" 2>/dev/null || true)
else
  # Fallback: walk the working tree, exclude .env* and the script itself
  matches=$(grep -rnE "$PATTERN" . \
    --exclude-dir=node_modules \
    --exclude-dir=.next \
    --exclude-dir=.git \
    --exclude='.env*' \
    --exclude='check-no-secrets.sh' \
    --exclude='remove-secrets-from-history.sh' 2>/dev/null || true)
fi

if [ -z "$matches" ]; then
  echo "✓ check-no-secrets: no live secrets found in tracked files."
  exit 0
fi

echo "✗ check-no-secrets: LIVE SECRETS DETECTED in tracked files." >&2
echo "" >&2
echo "$matches" >&2
echo "" >&2
echo "Replace them with environment variables (process.env.X) and rotate" >&2
echo "the leaked credentials immediately. See audit-reports/security-1.md F-01." >&2
exit 1
