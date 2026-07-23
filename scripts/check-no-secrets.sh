#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Pre-commit hook: check for real secrets in the repository
# ═══════════════════════════════════════════════════════════════
# Install with:
#   cp scripts/check-no-secrets.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or run manually:
#   ./scripts/check-no-secrets.sh
# ═══════════════════════════════════════════════════════════════

set -e

# Patterns that GitHub Secret Scanning flags
PATTERNS=(
  'sb_secret_[A-Za-z0-9_-]{20,}'
  'sb_publishable_[A-Za-z0-9]{20,}'
  're_[A-Za-z0-9]{20,}'
  'AIza[A-Za-z0-9_-]{20,}'
  'sk_live_[A-Za-z0-9]{20,}'
  'sk_test_[A-Za-z0-9]{20,}'
  'ghp_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{50,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
)

# Files to scan
EXTENSIONS='--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.json --include=*.md --include=*.sql --include=*.yml --include=*.yaml'

# Exclude these paths
EXCLUDES='--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude=check-no-secrets.sh --exclude=remove-secrets-from-history.sh'

FOUND=0
echo "═══════════════════════════════════════════════════════════════"
echo "  Checking for real secrets in tracked files..."
echo "═══════════════════════════════════════════════════════════════"

for pattern in "${PATTERNS[@]}"; do
  # Only check files that are tracked by git (if we're in a git repo)
  if [ -d .git ] && command -v git > /dev/null 2>&1; then
    matches=$(git ls-files | xargs grep -lE "$pattern" 2>/dev/null || true)
  else
    matches=$(grep -rlE "$pattern" $EXTENSIONS $EXCLUDES . 2>/dev/null || true)
  fi

  if [ -n "$matches" ]; then
    echo ""
    echo "  ✗ FOUND: $pattern"
    echo "  Files:"
    echo "$matches" | while IFS= read -r file; do
      echo "    $file"
    done
    FOUND=1
  fi
done

if [ $FOUND -eq 0 ]; then
  echo ""
  echo "  ✓ No secrets found. Safe to commit."
  exit 0
else
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✗ Real secrets detected. DO NOT commit."
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  Replace them with environment variables:"
  echo "    process.env.SUPABASE_SERVICE_ROLE_KEY"
  echo "    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY"
  echo "    process.env.RESEND_API_KEY"
  echo "    etc."
  echo ""
  exit 1
fi
