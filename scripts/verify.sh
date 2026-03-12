#!/usr/bin/env bash
# ============================================================================
# verify.sh — Verify a Chainguard node image has icu-dev installed
#
# Usage:
#   ./scripts/verify.sh <image>
#
# Examples:
#   ./scripts/verify.sh cgr.dev/my-org/custom-node-icu:latest
#   ./scripts/verify.sh cgr.dev/chainguard/node:latest          # expect failures
# ============================================================================

set -euo pipefail

IMAGE="${1:?Usage: $0 <image>}"
PASS=0
FAIL=0

info()  { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
ok()    { printf "\033[1;32m[PASS]\033[0m  %s\n" "$*"; PASS=$((PASS + 1)); }
fail()  { printf "\033[1;31m[FAIL]\033[0m  %s\n" "$*"; FAIL=$((FAIL + 1)); }

info "Checking image: ${IMAGE}"
echo

# ── 1. Pull the image ──────────────────────────────────────────────────────

info "Pulling image..."
docker pull "${IMAGE}" 2>/dev/null

# ── 2. Check for ICU dev headers ───────────────────────────────────────────

info "Checking for ICU development headers..."
if docker run --rm --entrypoint /bin/sh "${IMAGE}" -c \
   "test -d /usr/include/unicode && ls /usr/include/unicode/unistr.h >/dev/null 2>&1"; then
  ok "ICU development headers found (/usr/include/unicode/)"
else
  fail "ICU development headers missing"
fi

# ── 3. Check for linker symlinks ───────────────────────────────────────────

info "Checking for ICU linker symlinks..."
if docker run --rm --entrypoint /bin/sh "${IMAGE}" -c \
   "test -L /usr/lib/libicuuc.so 2>/dev/null"; then
  ok "ICU linker symlinks present (libicuuc.so)"
else
  fail "ICU linker symlinks missing (no libicuuc.so)"
fi

# ── 4. Check for pkg-config files ─────────────────────────────────────────

info "Checking for pkg-config support..."
if docker run --rm --entrypoint /bin/sh "${IMAGE}" -c \
   "test -f /usr/lib/pkgconfig/icu-uc.pc 2>/dev/null"; then
  ok "pkg-config files found (icu-uc.pc)"
else
  fail "pkg-config files missing"
fi

# ── 5. Run the demo probe app ─────────────────────────────────────────────

info "Building demo container..."
docker build --build-arg "NODE_IMAGE=${IMAGE}" -t icu-demo-verify -f Dockerfile . >/dev/null 2>&1

info "Running ICU dev probe..."
echo
if docker run --rm icu-demo-verify; then
  ok "Probe app: all checks passed"
else
  fail "Probe app: some checks failed"
fi

# ── Summary ────────────────────────────────────────────────────────────────

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "  Results:  \033[32m%d passed\033[0m  /  \033[31m%d failed\033[0m\n" "$PASS" "$FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
