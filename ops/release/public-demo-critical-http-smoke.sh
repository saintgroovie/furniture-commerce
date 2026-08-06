#!/usr/bin/env bash
# Critical HTTP smoke for public_demo (no browser). Fail-closed on identity/noindex.
# Not LIVE_MUTATING - read-only HTTP.
set -Eeuo pipefail
IFS=$'\n\t'

BUYER_HOST=""
API_HOST=""
EXPECT_SHA=""
PDP_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --buyer-host) BUYER_HOST="${2:?}"; shift 2 ;;
    --api-host) API_HOST="${2:?}"; shift 2 ;;
    --expect-sha) EXPECT_SHA="${2:?}"; shift 2 ;;
    --pdp-url) PDP_URL="${2:?}"; shift 2 ;;
    *) shift ;;
  esac
done

[[ -n "$BUYER_HOST" && -n "$API_HOST" && -n "$EXPECT_SHA" ]] || {
  echo "usage: public-demo-critical-http-smoke.sh --buyer-host URL --api-host URL --expect-sha SHA [--pdp-url URL]" >&2
  exit 2
}

BUYER_HOST="${BUYER_HOST%/}"
API_HOST="${API_HOST%/}"

check() {
  local url="$1"
  local need_sha="${2:-1}"
  local code hdrs
  hdrs="$(mktemp)"
  code="$(curl -sS --max-time 25 -o /dev/null -w '%{http_code}' -D "$hdrs" "$url" || echo 000)"
  echo "smoke url=$url code=$code"
  [[ "$code" =~ ^2 ]] || { rm -f "$hdrs"; return 1; }
  if [[ "$need_sha" == "1" ]]; then
    grep -qi "x-woodright-release-sha: ${EXPECT_SHA}" "$hdrs" || { rm -f "$hdrs"; return 1; }
    grep -qi "x-robots-tag:.*noindex" "$hdrs" || { rm -f "$hdrs"; return 1; }
  fi
  rm -f "$hdrs"
  return 0
}

check "${BUYER_HOST}/" 1
check "${BUYER_HOST}/contacts" 1
check "${BUYER_HOST}/catalog" 1
check "${BUYER_HOST}/cart" 1
check "${API_HOST}/health" 1
if [[ -n "$PDP_URL" ]]; then
  check "$PDP_URL" 1
fi
echo "CRITICAL_HTTP_SMOKE_OK sha=$EXPECT_SHA"
