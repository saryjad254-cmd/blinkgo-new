#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Run all BlinkGo tests with isolated server restarts
# ═══════════════════════════════════════════════════════════════
# This script restarts the Next.js server between tests so the
# in-memory rate limiter (lib/rate-limit.ts) is reset.
# This prevents rate-limit cascades from breaking later tests.
#
# Usage:
#   ./scripts/run-all-tests.sh
# ═══════════════════════════════════════════════════════════════

set -e

# Load env
set -a && source .env && set +a
export APP_URL="${APP_URL:-https://politics-absent-vincent-madonna.trycloudflare.com}"

PORT=3000
LOG=/workspace/srv.log

start_server() {
  pkill -9 -f "next" 2>/dev/null || true
  sleep 3
  NODE_OPTIONS="--max-old-space-size=2048" nohup node node_modules/next/dist/bin/next start -p $PORT > $LOG 2>&1 &
  disown
  # Wait for server to be up
  for i in {1..30}; do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT --max-time 2 || echo "000")
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: server did not start"
  return 1
}

# Tests that need env vars loaded
TESTS_NEED_ENV=(
  "auth-flow-test.js|Auth flow (60)"
  "oauth-pkce-e2e.js|OAuth PKCE (18)"
  "oauth-flow-test.js|OAuth flow (17)"
)

# Tests that don't need env
TESTS_NO_ENV=(
  "security-test.js|Security (22)"
  "csrf-test.js|CSRF (19)"
  "rbac-negative-test.js|RBAC (34)"
  "edge-cases-test.js|Edge cases (20)"
  "customer-journey-test.js|Customer journey (29)"
  "restaurant-workflow-test.js|Restaurant workflow (18)"
  "lifecycle-test.js|Lifecycle E2E"
  "verify-otp-flow.js|OTP flow"
)

PASS=0
FAIL=0
FAIL_LIST=""

run_test() {
  local script=$1
  local name=$2
  local result=$(timeout 60 node "scripts/$script" 2>&1 | tail -3)
  if echo "$result" | grep -qE "(passed, 0 failed|Total: [0-9]+ \| Pass: [0-9]+ \| Fail: 0|ALL TESTS PASSED|All.*checks passed)"; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name"
    echo "  Output:"
    echo "$result" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAIL_LIST="$FAIL_LIST\n  - $name"
  fi
}

echo "═══════════════════════════════════════════════════════"
echo "  Running BlinkGo test suite (isolated)"
echo "═══════════════════════════════════════════════════════"

# Phase 1: tests that need .env loaded
echo ""
echo "▶ Phase 1: Tests requiring .env"
set -a && source .env && set +a
for entry in "${TESTS_NEED_ENV[@]}"; do
  IFS='|' read -r script name <<< "$entry"
  start_server
  run_test "$script" "$name"
done

# Phase 2: tests that don't need .env (server reads from real env)
echo ""
echo "▶ Phase 2: Tests using server env"
set -a && source .env && set +a
for entry in "${TESTS_NO_ENV[@]}"; do
  IFS='|' read -r script name <<< "$entry"
  start_server
  run_test "$script" "$name"
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RESULTS: $PASS pass / $FAIL fail"
echo "═══════════════════════════════════════════════════════"
if [ $FAIL -gt 0 ]; then
  echo "Failed tests:"
  echo -e "$FAIL_LIST"
  exit 1
fi
echo "All tests passed! 🎉"
