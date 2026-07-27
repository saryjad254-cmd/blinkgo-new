#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Remove leaked secrets from Git history (BFG / filter-repo)
# ═══════════════════════════════════════════════════════════════
#
# USAGE:
#   1. Install git-filter-repo:
#      pip install git-filter-repo
#      OR
#      brew install git-filter-repo
#      OR use BFG (https://rtyley.github.io/bfg-repo-cleaner/)
#
#   2. Run this script from the root of your local Git clone:
#      cd /path/to/your/blinkgo-clone
#      ./scripts/remove-secrets-from-history.sh
#
#   3. After the rewrite, force-push to GitHub:
#      git remote add origin git@github.com:YOUR_ORG/blinkgo.git
#      git push --force --all
#      git push --force --tags
#
#   4. ROTATE THE LEAKED KEYS in Supabase (see step 5 below)
#
#   5. Important: anyone with the old commits must re-clone.
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  BlinkGo Secret Cleanup from Git History"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: Not a Git repository."
  echo "Run this from the root of your local Git clone of BlinkGo."
  exit 1
fi

# Check if git-filter-repo is available
if ! command -v git-filter-repo > /dev/null 2>&1; then
  echo "ERROR: git-filter-repo is not installed."
  echo ""
  echo "Install it with one of:"
  echo "  pip install git-filter-repo"
  echo "  brew install git-filter-repo"
  echo "  apt install git-filter-repo"
  echo ""
  echo "OR use BFG instead: https://rtyley.github.io/bfg-repo-cleaner/"
  echo ""
  echo "  bfg --replace-text passwords.txt  # list of strings to remove"
  echo "  git reflog expire --expire=now --all"
  echo "  git gc --prune=now --aggressive"
  exit 1
fi

echo "→ Current HEAD: $(git rev-parse --short HEAD)"
echo "→ Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "→ Commits in history: $(git rev-list --count HEAD)"
echo ""

# Backup the current state
echo "→ Creating safety backup..."
BACKUP_BRANCH="backup-before-secret-cleanup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "  Backup branch: $BACKUP_BRANCH"
echo ""

# Build a list of secret patterns to remove
# IMPORTANT: Edit the file below to add your actual leaked secrets!
# Use `git filter-repo --replace-text FILE` to rewrite history.
#
# The file should have one secret per line. Each secret in the file will
# be replaced with "***REMOVED***" in every commit that contains it.
SECRETS_FILE=$(mktemp)
cat > "$SECRETS_FILE" << 'EOF'
YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE
YOUR_LEAKED_SUPABASE_ANON_KEY_HERE
EOF
echo "→ Secrets to remove from history (one per line):"
cat "$SECRETS_FILE"
echo ""
echo "  >>> Edit $SECRETS_FILE to add the actual leaked keys before continuing <<<"
echo "  >>> Or pass --force to skip this check (DANGEROUS) <<<"
echo ""

# Read each secret and rewrite history
while IFS= read -r secret; do
  if [ -z "$secret" ]; then continue; fi
  echo "→ Removing: $secret"
  # Use --replace-text with each secret. git-filter-repo replaces
  # the matched text with "***REMOVED***" by default.
  git filter-repo --force --replace-text "$SECRETS_FILE" --blob-callback '
    import re
    def callback(blob, meta):
      # Replace the leaked secret
      content = blob.data.decode("utf-8", errors="ignore")
      if re.search(r"sb_secret_[A-Za-z0-9_-]{20,}", content):
        content = re.sub(r"sb_secret_[A-Za-z0-9_-]{20,}", "***REMOVED***", content)
        return content.encode("utf-8")
      if re.search(r"sb_publishable_[A-Za-z0-9]{20,}", content):
        content = re.sub(r"sb_publishable_[A-Za-z0-9]{20,}", "***REMOVED***", content)
        return content.encode("utf-8")
      return blob.data
  '
done < "$SECRETS_FILE"

rm -f "$SECRETS_FILE"

echo ""
echo "→ Cleaning up refs..."
git for-each-ref --format='%(refname)' refs/original/ | xargs -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Git history cleaned. Verify before force-push:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  git log --all --full-history -- scripts/oauth-pkce-e2e.js | head -20"
echo "  git log --all --full-history -S 'sb_secret_yr6kO' --oneline"
echo ""
echo "  The grep should return NOTHING. If you see the secret, run again."
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  NEXT STEPS:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  1. Verify history is clean (commands above)"
echo ""
echo "  2. ROTATE THE LEAKED KEYS in Supabase:"
echo "     - Go to https://supabase.com/dashboard/project/rhdaffhlrglyknxtucux/settings/api"
echo "     - Click 'Generate new service role key'"
echo "     - Click 'Generate new anon key' (if you also want to rotate that)"
echo "     - Update Vercel env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "     - Redeploy"
echo ""
echo "  3. Force-push to GitHub:"
echo "     git push --force --all"
echo "     git push --force --tags"
echo ""
echo "  4. Inform collaborators to re-clone (the old commits are now invalid)"
echo ""
echo "  5. Verify GitHub secret scanning now passes:"
echo "     https://github.com/YOUR_ORG/blinkgo/security/secret-scanning"
echo ""
echo "═══════════════════════════════════════════════════════════════"
