#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# BlinkGo Code Review Script
# ════════════════════════════════════════════════════════════════════════
#
# Quick automated checks to verify code quality, brand consistency,
# and security best practices.
#
# Usage: bash scripts/review.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; WARN=$((WARN+1)); }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

echo "═══════════════════════════════════════════"
echo "  BlinkGo Code Review"
echo "═══════════════════════════════════════════"
echo ""

# ────────────────────────────────────────────────────────
# 1. Project structure
# ────────────────────────────────────────────────────────
info "1. Project Structure"

[ -d app ] && pass "app/ directory exists" || fail "app/ directory missing"
[ -d components ] && pass "components/ directory exists" || fail "components/ directory missing"
[ -d lib ] && pass "lib/ directory exists" || fail "lib/ directory missing"
[ -d public ] && pass "public/ directory exists" || fail "public/ directory missing"
[ -f package.json ] && pass "package.json exists" || fail "package.json missing"
[ -f tsconfig.json ] && pass "tsconfig.json exists" || fail "tsconfig.json missing"
[ -f next.config.js ] && pass "next.config.js exists" || fail "next.config.js missing"
[ -f tailwind.config.js ] && pass "tailwind.config.js exists" || fail "tailwind.config.js missing"
[ -f middleware.ts ] && pass "middleware.ts exists" || fail "middleware.ts missing"

# ────────────────────────────────────────────────────────
# 2. Brand identity
# ────────────────────────────────────────────────────────
echo ""
info "2. Brand Identity"

[ -f public/brand/blinkgo-logo.png ] && pass "Official logo PNG exists" || fail "Official logo missing"
[ -f public/brand/blinkgo-icon.png ] && pass "Official icon exists" || fail "Official icon missing"
[ -f public/brand/blinkgo-3d.png ] && pass "Official 3D logo exists" || fail "Official 3D logo missing"
[ -f public/favicon.svg ] && pass "Favicon SVG exists" || fail "Favicon SVG missing"
[ -f lib/brand/tokens.ts ] && pass "Design tokens exist" || fail "Design tokens missing"
[ -f lib/brand/IDENTITY.md ] && pass "Brand identity doc exists" || fail "Brand identity doc missing"

# Check for brand colors
if grep -q "#F5B819" lib/brand/tokens.ts; then
  pass "Brand Yellow (#F5B819) defined in tokens"
else
  fail "Brand Yellow NOT found in tokens"
fi

if grep -q "#DC2626" lib/brand/tokens.ts; then
  pass "Brand Red (#DC2626) defined in tokens"
else
  fail "Brand Red NOT found in tokens"
fi

if grep -q "#0A0A0A" lib/brand/tokens.ts; then
  pass "Brand Black (#0A0A0A) defined in tokens"
else
  fail "Brand Black NOT found in tokens"
fi

# ────────────────────────────────────────────────────────
# 3. Design system components
# ────────────────────────────────────────────────────────
echo ""
info "3. Design System Components"

COMPONENTS=(
  "BlinkLogo" "BlinkButton" "BlinkCard" "BlinkInput"
  "BlinkBadge" "BlinkHeader" "BlinkAvatar" "BlinkSplash"
  "BlinkMapMarker" "BlinkModal" "BlinkStat" "BlinkToast"
)
for c in "${COMPONENTS[@]}"; do
  if [ -f "components/brand/${c}.tsx" ]; then
    pass "${c} component exists"
  else
    fail "${c} component MISSING"
  fi
done

# ────────────────────────────────────────────────────────
# 4. Old colors that should NOT exist
# ────────────────────────────────────────────────────────
echo ""
info "4. Old Color Check (should find nothing)"

# Check for old orange hex colors that should be brand red
ORANGE_HEXES=("#FF6B1A" "#FF8A3D" "#E5560A" "#FFA552" "#F97316" "#FB923C" "#F59E0B")
ORANGE_FOUND=0
for hex in "${ORANGE_HEXES[@]}"; do
  # Check in source files (not in tokens.ts or design system)
  matches=$(grep -rE "$hex" app/ components/ lib/ --include="*.tsx" --include="*.ts" --include="*.css" 2>/dev/null | grep -v "lib/brand/" | grep -v "components/brand/" | grep -v "//" | grep -v "D97706" | head -3)
  if [ -n "$matches" ]; then
    warn "Found old color $hex in:"
    echo "$matches" | head -3
    ORANGE_FOUND=1
  fi
done
[ $ORANGE_FOUND -eq 0 ] && pass "No legacy orange colors in source code"

# ────────────────────────────────────────────────────────
# 5. Tailwind classes
# ────────────────────────────────────────────────────────
echo ""
info "5. Tailwind Class Check"

# Count brand class usage
BRAND_USES=$(grep -rE "brand-(red|yellow|black)" app/ components/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l)
LEGACY_USES=$(grep -rE "(amber|orange)-[0-9]+" app/ components/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l)
info "Brand classes: $BRAND_USES"
info "Legacy amber/orange classes: $LEGACY_USES"

if [ $BRAND_USES -gt 100 ]; then
  pass "Brand classes heavily used ($BRAND_USES)"
fi
if [ $LEGACY_USES -lt 10 ]; then
  pass "Minimal legacy color classes ($LEGACY_USES)"
fi

# ────────────────────────────────────────────────────────
# 6. Security checks
# ────────────────────────────────────────────────────────
echo ""
info "6. Security"

if grep -q "CSRF" middleware.ts; then
  pass "CSRF protection in middleware"
fi

if grep -q "rateLimit\|rate-limit" lib/ -r 2>/dev/null; then
  pass "Rate limiting configured"
fi

if grep -q "requireApiRole" lib/ -r 2>/dev/null; then
  pass "API role guards implemented"
fi

# Check for hardcoded secrets
if grep -qE "password.*=.*['\"][^'\"]{8,}" .env 2>/dev/null; then
  warn "Possible hardcoded password in .env (expected for demo)"
fi

# ────────────────────────────────────────────────────────
# 7. TypeScript
# ────────────────────────────────────────────────────────
echo ""
info "7. TypeScript"

if grep -q '"strict": true' tsconfig.json; then
  pass "TypeScript strict mode enabled"
else
  warn "TypeScript strict mode not enabled"
fi

# ────────────────────────────────────────────────────────
# 8. Code stats
# ────────────────────────────────────────────────────────
echo ""
info "8. Code Statistics"

TSX_COUNT=$(find . -name "*.tsx" -not -path "./node_modules/*" -not -path "./.next/*" 2>/dev/null | wc -l)
TS_COUNT=$(find . -name "*.ts" -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./scripts/*" 2>/dev/null | wc -l)
PAGE_COUNT=$(find app -name "page.tsx" 2>/dev/null | wc -l)
COMP_COUNT=$(find components -name "*.tsx" 2>/dev/null | wc -l)
API_COUNT=$(find app/api -name "route.ts" 2>/dev/null | wc -l)

info "TSX files: $TSX_COUNT"
info "TS files: $TS_COUNT"
info "Pages: $PAGE_COUNT"
info "Components: $COMP_COUNT"
info "API routes: $API_COUNT"

# ────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Results"
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✅ All critical checks passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed. Please review.${NC}"
  exit 1
fi
