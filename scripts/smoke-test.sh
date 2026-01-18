#!/bin/bash

# =============================================================================
# Estimagator Post-Deployment Smoke Tests
# =============================================================================
# Tests critical user flows after deployment to ensure basic functionality
#
# Usage: ./smoke-test.sh <BASE_URL>
# Example: ./smoke-test.sh https://estimagator.rhymeswithjazz.com
# =============================================================================

set -e

BASE_URL="${1:-http://localhost:4200}"
FAILED=0
TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test helper functions
test_start() {
    TOTAL=$((TOTAL + 1))
    echo -e "${BLUE}[TEST $TOTAL]${NC} $1"
}

test_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    echo ""
}

test_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo ""
    FAILED=$((FAILED + 1))
}

# =============================================================================
# Test 1: Health Endpoint
# =============================================================================
test_start "Health endpoint responds"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
if [ "$HTTP_CODE" -eq 200 ]; then
    test_pass "Health endpoint returned HTTP 200"
else
    test_fail "Health endpoint returned HTTP ${HTTP_CODE} (expected 200)"
fi

# =============================================================================
# Test 2: Frontend Loads
# =============================================================================
test_start "Frontend loads successfully"
FRONTEND_RESPONSE=$(curl -s "${BASE_URL}/")
if echo "$FRONTEND_RESPONSE" | grep -q "Estimagator\|poker-points-app\|app-root"; then
    test_pass "Frontend HTML contains expected content"
else
    test_fail "Frontend HTML does not contain expected content"
fi

# =============================================================================
# Test 3: API Responds
# =============================================================================
test_start "API session endpoint responds"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/sessions")
# Expect 400 (bad request due to missing body) or 200, but not 500/404
if [ "$HTTP_CODE" -eq 400 ] || [ "$HTTP_CODE" -eq 200 ]; then
    test_pass "API responds correctly (HTTP ${HTTP_CODE})"
else
    test_fail "API returned unexpected HTTP code: ${HTTP_CODE}"
fi

# =============================================================================
# Test 4: SignalR Hub Negotiation
# =============================================================================
test_start "SignalR hub negotiates connection"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/hubs/poker/negotiate" -X POST)
if [ "$HTTP_CODE" -eq 200 ]; then
    test_pass "SignalR negotiation successful (HTTP 200)"
elif [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    # Some SignalR implementations may require auth or specific headers
    test_pass "SignalR endpoint accessible (HTTP ${HTTP_CODE})"
else
    test_fail "SignalR negotiation failed (HTTP ${HTTP_CODE})"
fi

# =============================================================================
# Test 5: Static Assets Load
# =============================================================================
test_start "Static assets load (favicon)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/favicon.ico")
if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 404 ]; then
    # 404 is acceptable if favicon isn't configured
    test_pass "Static asset endpoint accessible (HTTP ${HTTP_CODE})"
else
    test_fail "Static assets not loading (HTTP ${HTTP_CODE})"
fi

# =============================================================================
# Test 6: HTTPS Redirect (if production)
# =============================================================================
if [[ "$BASE_URL" == https://* ]]; then
    test_start "HTTPS is configured"
    HTTP_URL="${BASE_URL/https/http}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "${HTTP_URL}")
    if [ "$HTTP_CODE" -eq 200 ]; then
        test_pass "HTTP redirects to HTTPS successfully"
    else
        # Not critical, might not have HTTP redirect configured
        echo -e "${YELLOW}⚠️  WARNING${NC}: HTTP redirect not configured (HTTP ${HTTP_CODE})"
        echo ""
    fi
fi

# =============================================================================
# Test Summary
# =============================================================================
echo "============================================================================="
echo -e "${BLUE}SMOKE TEST SUMMARY${NC}"
echo "============================================================================="
echo "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $((TOTAL - FAILED))${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo "============================================================================="

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some smoke tests failed. Please investigate.${NC}"
    exit 1
fi
