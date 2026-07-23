# GitHub Push Protection Cleanup — Operator Runbook

## Problem
GitHub Push Protection blocked a push because `scripts/full-flow.js` line 2 contained a hardcoded Supabase service role key. This runbook removes every hardcoded secret from the repository and creates a clean commit that will pass GitHub Push Protection.

## What Was Fixed in This Commit (v77)

### 1. Removed Hardcoded Secret
**File**: `scripts/full-flow.js`
**Old line 2**:
```javascript
const SERVICE_KEY = 'YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE';
```

**New behavior**: All secrets are read from environment variables. The script fails fast with a clear error if any required env var is missing:
```javascript
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required (admin operations)');
  process.exit(1);
}
```

### 2. Sanitized Documentation
**File**: `PHASE_18_REPORT.md`
- The example `APNS_PRIVATE_KEY="<example-private-key-format>"` was changed to `APNS_PRIVATE_KEY="<set-in-env-or-replace-with-real-key>"` to avoid false positives in secret scanners.

## Operator Steps — Run on Your Local Clone

### Step 1: Pull the Latest Changes
```bash
cd /path/to/your/blinkgo-clone
git fetch origin
git checkout main  # or your working branch
git pull
```

### Step 2: Apply the Fixed Files
The fixed files are in `/workspace/blinkgo-flat/`:
- `scripts/full-flow.js` — new version (no hardcoded secrets)
- `PHASE_18_REPORT.md` — sanitized

You can either:
- (a) Manually copy the new `scripts/full-flow.js` over your local copy
- (b) Apply the changes from this runbook to your files

### Step 3: Verify the Files Are Clean
Run the secret scan:
```bash
./scripts/check-no-secrets.sh
```

Expected output:
```
═══════════════════════════════════════════════════════════════
  Checking for real secrets in tracked files...
═══════════════════════════════════════════════════════════════

  ✓ No secrets found. Safe to commit.
```

### Step 4: Install the Pre-commit Hook (Recommended)
To prevent future leaks:
```bash
cp scripts/check-no-secrets.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Now every `git commit` will be blocked if a real secret is found.

### Step 5: Clean Git History (REQUIRED for GitHub Push Protection to Pass)

The old `scripts/full-flow.js` with the hardcoded key is **still in your Git history**. Even after fixing the file, GitHub will block the push because the secret exists in earlier commits.

Use the provided `scripts/remove-secrets-from-history.sh`:

```bash
# 1. Install git-filter-repo if not already
pip install git-filter-repo
# OR
brew install git-filter-repo

# 2. Edit the script to add the actual leaked key
#    Open scripts/remove-secrets-from-history.sh and replace:
#      YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE
#    with the actual leaked key:
#      YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE

# 3. Run the cleanup script
./scripts/remove-secrets-from-history.sh
```

This will:
- Create a backup branch: `backup-before-secret-cleanup-<timestamp>`
- Use `git-filter-repo` to rewrite every commit containing the leaked key
- Replace the key with `***REMOVED***` in all commits

### Step 6: Force-Push
```bash
git push --force --all
git push --force --tags
```

### Step 7: Verify GitHub Secret Scanning Now Passes
Visit: `https://github.com/YOUR_ORG/blinkgo/security/secret-scanning`

If it still shows alerts:
- The leaked key is still in some commit — re-check with `git log -p --all | grep "YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE"`
- If no matches, the alert will clear automatically within ~5 minutes

### Step 8: Rotate the Leaked Key in Supabase
The leaked key should be considered **public** and **must be rotated**:

1. Go to https://supabase.com/dashboard/project/rhdaffhlrglyknxtucux/settings/api
2. Click "Generate new service role key" (this invalidates the old one)
3. Update Vercel environment variables with the new key
4. Trigger a Vercel redeploy

### Step 9: Inform Collaborators
Anyone with the old commits must re-clone the repository. The old commit hashes are now invalid.

## What If I Don't Have git-filter-repo?

If you can't install `git-filter-repo`, you can use `git filter-branch` (slower but works):

```bash
# WARNING: This rewrites all commits. Make a backup first!
git branch backup-before-secret-cleanup
git filter-branch --force --index-filter \
  "git ls-files | xargs grep -l 'YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE' | xargs -I {} sed -i 's|YOUR_LEAKED_SUPABASE_SERVICE_ROLE_KEY_HERE|***REMOVED***|g' {}" \
  --prune-empty --tag-name-filter cat -- --all
```

## Verification

After the cleanup, the following should all be true:

1. **No secrets in tracked files**:
   ```bash
   ./scripts/check-no-secrets.sh
   # Expected: ✓ No secrets found. Safe to commit.
   ```

2. **No secrets in commit history**:
   ```bash
   git log -p --all | grep -E "sb_secret_[A-Za-z0-9_-]{20,}" | head -5
   # Expected: no output (or only "***REMOVED***" markers)
   ```

3. **GitHub Secret Scanning is clean**:
   - Visit https://github.com/YOUR_ORG/blinkgo/security/secret-scanning
   - Should show "No alerts"

4. **The new commit passes Push Protection**:
   ```bash
   git push
   # Expected: success (no blocking)
   ```

## Files Changed in v77 (Summary)

| File | Change |
|------|--------|
| `scripts/full-flow.js` | Removed hardcoded `SERVICE_KEY`; now reads from env vars |
| `PHASE_18_REPORT.md` | Sanitized example private key placeholder |
| `scripts/check-no-secrets.sh` | Already existed; updated patterns |
| `scripts/remove-secrets-from-history.sh` | Already existed; uses git-filter-repo |

## Why We Don't Use the "Unblock Secret" Link

GitHub offers an "unblock secret" option that lets you push anyway after acknowledging the leak. **We are NOT using that option** because:

1. The leaked key is now in a public-facing support transcript
2. The key is now considered compromised
3. The cleanest path is to **rotate the key** and **clean the history**
4. Future secret scanners (TruffleHog, GitGuardian) will still detect the historical leak
5. Audit compliance requires removing secrets from history, not just acknowledging them
