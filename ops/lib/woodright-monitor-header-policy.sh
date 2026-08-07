#!/usr/bin/env bash
# Profile-aware header applicability for woodright-health-check.sh.
# Pure decision helpers (exposure + URL scheme/host). No network I/O.
# shellcheck shell=bash

# Parse http(s) URL into JSON: {"ok":bool,"scheme":"...","host":"...","port":"...","error":"..."}
# Uses Python urllib - no eval / fragile substring matching.
wr_monitor_parse_http_url() {
  local url="${1:-}"
  python3 -c '
import json, sys
from urllib.parse import urlsplit

raw = sys.argv[1] if len(sys.argv) > 1 else ""
if not raw or not str(raw).strip():
    print(json.dumps({"ok": False, "scheme": "", "host": "", "port": "", "error": "empty"}))
    raise SystemExit(0)
try:
    parts = urlsplit(raw.strip())
    scheme = (parts.scheme or "").lower()
    host = parts.hostname
    if host is None:
        host = ""
    host = str(host).lower().rstrip(".")
    # parts.port may raise ValueError on malformed ports (e.g. :bad)
    port = ""
    if parts.port is not None:
        port = str(parts.port)
except Exception:
    print(json.dumps({"ok": False, "scheme": "", "host": "", "port": "", "error": "unparseable"}))
    raise SystemExit(0)
if scheme not in ("http", "https") or not host:
    print(json.dumps({"ok": False, "scheme": scheme, "host": host, "port": port, "error": "unparseable"}))
    raise SystemExit(0)
print(json.dumps({"ok": True, "scheme": scheme, "host": host, "port": port, "error": ""}))
' "$url"
}


# Print sanitized target for diagnostics: scheme://host[:port]/  (no userinfo/query/fragment)
wr_monitor_sanitize_http_target() {
  local url="${1:-}"
  python3 -c '
import json, sys
from urllib.parse import urlsplit
raw = sys.argv[1] if len(sys.argv) > 1 else ""
try:
    parts = urlsplit(raw.strip())
    scheme = (parts.scheme or "").lower()
    host = parts.hostname or ""
    host = str(host).lower().rstrip(".")
    port = parts.port
except Exception:
    print("unparseable")
    raise SystemExit(0)
if scheme not in ("http", "https") or not host:
    print("unparseable")
    raise SystemExit(0)
if port is not None:
    print(f"{scheme}://{host}:{port}/")
else:
    print(f"{scheme}://{host}/")
' "$url"
}

wr_monitor_is_loopback_host() {
  local host="${1:-}"
  host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
  case "$host" in
    127.0.0.1|localhost|::1) return 0 ;;
    *) return 1 ;;
  esac
}

# Print: action\treason
# action: not_applicable | probe | fail
wr_monitor_buyer_hsts_policy() {
  local exposure="${1:-}"
  local url="${2:-}"
  local parsed scheme host ok error
  parsed="$(wr_monitor_parse_http_url "$url")"
  ok="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("ok"))' "$parsed")"
  if [[ "$ok" != "True" ]]; then
    printf '%s\t%s\n' "fail" "buyer_target_unparseable"
    return 0
  fi
  scheme="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("scheme",""))' "$parsed")"
  host="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("host",""))' "$parsed")"

  case "$exposure" in
    private)
      if [[ "$scheme" == "http" ]] && wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "not_applicable" "private_http_no_tls_edge"
        return 0
      fi
      if [[ "$scheme" == "http" ]] && ! wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "fail" "buyer_exposure_target_inconsistent"
        return 0
      fi
      if [[ "$scheme" == "https" ]]; then
        printf '%s\t%s\n' "probe" "https_edge_hsts_required"
        return 0
      fi
      printf '%s\t%s\n' "fail" "buyer_target_unparseable"
      return 0
      ;;
    public)
      if [[ "$scheme" == "https" ]]; then
        printf '%s\t%s\n' "probe" "https_edge_hsts_required"
        return 0
      fi
      if [[ "$scheme" == "http" ]]; then
        printf '%s\t%s\n' "fail" "public_buyer_https_required"
        return 0
      fi
      printf '%s\t%s\n' "fail" "buyer_target_unparseable"
      return 0
      ;;
    *)
      # Legacy / unset exposure: never invent private N/A; require HTTPS for HSTS probe,
      # and fail closed on plain HTTP (cannot claim HSTS PASS on HTTP).
      if [[ "$scheme" == "https" ]]; then
        printf '%s\t%s\n' "probe" "https_edge_hsts_required"
        return 0
      fi
      if [[ "$scheme" == "http" ]]; then
        printf '%s\t%s\n' "fail" "public_buyer_https_required"
        return 0
      fi
      printf '%s\t%s\n' "fail" "buyer_target_unparseable"
      return 0
      ;;
  esac
}

# Print: action\treason
# action: not_applicable | probe | fail
wr_monitor_api_x_robots_policy() {
  local exposure="${1:-}"
  local url="${2:-}"
  local parsed scheme host ok
  parsed="$(wr_monitor_parse_http_url "$url")"
  ok="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("ok"))' "$parsed")"
  if [[ "$ok" != "True" ]]; then
    printf '%s\t%s\n' "fail" "api_target_unparseable"
    return 0
  fi
  scheme="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("scheme",""))' "$parsed")"
  host="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("host",""))' "$parsed")"

  case "$exposure" in
    private)
      # N/A only for private + plain HTTP + loopback (Codex P1 / policy B).
      # Private HTTPS loopback must take the strict probe path - not benign N/A.
      if [[ "$scheme" == "http" ]] && wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "not_applicable" "private_loopback_api_not_publicly_indexable"
        return 0
      fi
      if wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "probe" "private_https_loopback_x_robots_required"
        return 0
      fi
      printf '%s\t%s\n' "fail" "api_exposure_target_inconsistent"
      return 0
      ;;
    public)
      if wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "fail" "api_exposure_target_inconsistent"
        return 0
      fi
      # Public / public_demo API hostnames must keep strict X-Robots enforcement.
      printf '%s\t%s\n' "probe" "public_api_x_robots_required"
      return 0
      ;;
    *)
      # Unset exposure: fail-closed for loopback-as-N/A; probe non-loopback; inconsistent loopback under unknown exposure.
      if wr_monitor_is_loopback_host "$host"; then
        printf '%s\t%s\n' "fail" "api_exposure_target_inconsistent"
        return 0
      fi
      printf '%s\t%s\n' "probe" "public_api_x_robots_required"
      return 0
      ;;
  esac
}
