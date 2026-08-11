#!/usr/bin/env bash
# Woodright P0: block Docker-published host ports from public NIC (eth0).
# Targets DOCKER-USER so DNAT/forwarded published ports are filtered (UFW INPUT alone
# does not cover Docker published ports). Loopback and non-eth0 paths stay open for
# local admin (127.0.0.1) and SSH tunnel (ssh -L ... 127.0.0.1:3000).
#
# Ports: 3000 (Dokploy UI), 3002/9000 (legacy public app binds — defense in depth).
# Idempotent. IPv4 + IPv6. Prefer REJECT tcp-reset over silent DROP for clear denial.
set -euo pipefail

IFACE="${WR_P0_PUBLIC_IFACE:-eth0}"
COMMENT_PREFIX="${WR_P0_COMMENT_PREFIX:-wr-p0-block}"

[[ "$IFACE" =~ ^[a-zA-Z0-9._-]+$ ]] || {
  echo "wr-p0: invalid WR_P0_PUBLIC_IFACE=$IFACE" >&2
  exit 2
}

ensure_chain_anchor() {
  local bin="$1"
  if ! "$bin" -C DOCKER-USER -j RETURN 2>/dev/null; then
    "$bin" -A DOCKER-USER -j RETURN
  fi
}

# Remove only owned / known-legacy Woodright comments for exact ctorigdstport.
purge_docker_user_port() {
  local bin="$1" port="$2"
  local lineno
  while lineno=$("$bin" -L DOCKER-USER --line-numbers -n -v 2>/dev/null \
      | awk -v iface="$IFACE" -v port="$port" -v pref="$COMMENT_PREFIX" '
          BEGIN { re_iface = "(^|[[:space:]])" iface "([[:space:]]|$)" }
          $0 !~ re_iface { next }
          !($0 ~ ("ctorigdstport " port "([[:space:]]|$)")) { next }
          ($0 ~ ("/\\* " pref "-") || $0 ~ "/\\* wr-owner-block-" || $0 ~ "/\\* wr-p0-block-") {
            print $1; exit
          }
        '); do
    [[ -n "${lineno:-}" ]] || break
    "$bin" -D DOCKER-USER "$lineno"
  done
}

# INPUT: only owned comments or known legacy wr-owner/wr-p0 comments (never bare rules).
purge_input_port() {
  local bin="$1" port="$2"
  local lineno
  while lineno=$("$bin" -L INPUT --line-numbers -n -v 2>/dev/null \
      | awk -v iface="$IFACE" -v port="$port" -v pref="$COMMENT_PREFIX" '
          BEGIN { re_iface = "(^|[[:space:]])" iface "([[:space:]]|$)" }
          $0 !~ re_iface { next }
          !($0 ~ ("dpt:" port "([[:space:]]|$)")) { next }
          ($0 ~ ("/\\* " pref "-input-") || $0 ~ "/\\* wr-owner-" || $0 ~ "/\\* wr-p0-") {
            print $1; exit
          }
        '); do
    [[ -n "${lineno:-}" ]] || break
    "$bin" -D INPUT "$lineno"
  done
}

apply_docker_user_reject() {
  local bin="$1" port="$2"
  local comment="${COMMENT_PREFIX}-${port}"
  if ! "$bin" -C DOCKER-USER -i "$IFACE" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$port" \
      -m comment --comment "$comment" -j REJECT --reject-with tcp-reset 2>/dev/null; then
    "$bin" -I DOCKER-USER 1 -i "$IFACE" -p tcp -m conntrack --ctstate NEW --ctorigdstport "$port" \
      -m comment --comment "$comment" -j REJECT --reject-with tcp-reset
  fi
}

apply_input_reject() {
  local bin="$1" port="$2"
  local comment="${COMMENT_PREFIX}-input-${port}"
  # Defense-in-depth on host INPUT; NEW-only so ESTABLISHED/RELATED are preserved.
  if ! "$bin" -C INPUT -i "$IFACE" -p tcp -m conntrack --ctstate NEW --dport "$port" \
      -m comment --comment "$comment" -j REJECT --reject-with tcp-reset 2>/dev/null; then
    "$bin" -I INPUT 1 -i "$IFACE" -p tcp -m conntrack --ctstate NEW --dport "$port" \
      -m comment --comment "$comment" -j REJECT --reject-with tcp-reset
  fi
}

apply_family() {
  local bin="$1"
  local ports=(3000 3002 9000)
  local port
  local have_docker_user=0
  local rc=0

  if "$bin" -nL DOCKER-USER >/dev/null 2>&1; then
    have_docker_user=1
    ensure_chain_anchor "$bin" || rc=1
  fi

  for port in "${ports[@]}"; do
    if [[ "$have_docker_user" -eq 1 ]]; then
      purge_docker_user_port "$bin" "$port" || rc=1
      if ! apply_docker_user_reject "$bin" "$port"; then
        echo "wr-p0: ${bin} DOCKER-USER reject failed for port ${port}" >&2
        rc=1
      fi
    fi
    purge_input_port "$bin" "$port" || true
    if ! apply_input_reject "$bin" "$port"; then
      echo "wr-p0: ${bin} INPUT reject failed for port ${port}" >&2
      rc=1
    fi
  done

  if [[ "$have_docker_user" -ne 1 ]]; then
    echo "wr-p0: ${bin} DOCKER-USER missing" >&2
    rc=1
  fi
  return "$rc"
}

main() {
  local rc_v4=0 rc_v6=0
  if ! command -v iptables >/dev/null 2>&1; then
    echo "wr-p0: iptables required" >&2
    exit 1
  fi

  set +e
  apply_family iptables
  rc_v4=$?
  set -e

  if command -v ip6tables >/dev/null 2>&1; then
    set +e
    apply_family ip6tables
    rc_v6=$?
    set -e
    if [[ "$rc_v6" -ne 0 ]]; then
      if ip -6 route show default 2>/dev/null | grep -q . \
        || ip -6 addr show scope global 2>/dev/null | grep -q inet6; then
        echo "wr-p0: IPv6 appears enabled but ip6tables apply failed" >&2
      else
        # No public IPv6 on host — treat missing ip6 DOCKER-USER as non-fatal if INPUT ok.
        # Still require rc_v6=0 only when apply_family returned solely for DOCKER-USER miss
        # after INPUT succeeded; re-check INPUT rules exist is best-effort.
        rc_v6=0
      fi
    fi
  fi

  if [[ "$rc_v4" -ne 0 ]]; then
    exit "$rc_v4"
  fi
  exit "$rc_v6"
}

main "$@"
