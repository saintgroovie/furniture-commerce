#!/usr/bin/env bash
# Fidelity tests for wr-p0-docker-user-blocks (fixtures / static).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/security/wr-p0-docker-user-blocks.sh"
UNIT="$ROOT/ops/systemd/wr-p0-docker-user-blocks.service"
FAIL=0
pass(){ echo "PASS: $*"; }
fail(){ echo "FAIL: $*"; FAIL=$((FAIL+1)); }

[[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"
bash -n "$SCRIPT" && pass "bash -n script" || fail "bash -n script"
bash -n "$ROOT/ops/security/install-wr-p0-docker-user-blocks.sh" && pass "bash -n install" || fail "bash -n install"
grep -q 'DOCKER-USER' "$SCRIPT" && pass "uses DOCKER-USER" || fail "missing DOCKER-USER"
grep -q 'ip6tables' "$SCRIPT" && pass "covers ip6tables" || fail "no ip6tables"
grep -q 'REJECT' "$SCRIPT" && pass "uses REJECT" || fail "no REJECT"
grep -q '3000' "$SCRIPT" && pass "blocks 3000" || fail "no 3000"
grep -q 'purge_docker_user_port\|idempotent\|-C DOCKER-USER' "$SCRIPT" && pass "idempotent checks" || fail "no idempotence"
grep -q 'After=docker.service' "$UNIT" && pass "unit After docker" || fail "unit ordering"
grep -q 'wr-p0-docker-user-blocks.sh' "$UNIT" && pass "unit ExecStart" || fail "unit ExecStart"
grep -q '33000:127.0.0.1:3000\|127.0.0.1:3000' "$ROOT/docs/operator/dokploy-ssh-tunnel-access.md" && pass "tunnel docs" || fail "tunnel docs"
# Must not touch SSH/HTTP/HTTPS/app ports as block targets
if grep -EIn 'ctorigdstport (22|80|443|3200|9200)\b|--dport (22|80|443|3200|9200)\b' "$SCRIPT"; then
  fail "script references 22/80/443/3200/9200 as block targets"
else
  pass "does not block 22/80/443/3200/9200"
fi
grep -q 'iptables required' "$SCRIPT" && pass "fail-closed ipv4 required" || fail "missing ipv4 required"
grep -q 'apply_input_reject' "$SCRIPT" && pass "INPUT independent path" || fail "no INPUT path"
grep -q 'COMMENT_PREFIX\|wr-p0-block' "$SCRIPT" && pass "owned-comment purge" || fail "no owned comment"
# Secret-ish
if grep -EIn 'password|api_key|BEGIN RSA|SECRET=' "$SCRIPT" "$UNIT"; then fail "secret-like"; else pass "no secrets"; fi

if [[ "${WR_P0_LIVE_TEST:-0}" == "1" ]] && command -v iptables >/dev/null && iptables -nL DOCKER-USER >/dev/null 2>&1; then
  sudo "$SCRIPT"
  sudo "$SCRIPT" # second apply idempotent
  c1=$(sudo iptables -S DOCKER-USER | grep -c 'ctorigdstport 3000' || true)
  [[ "$c1" -eq 1 ]] && pass "live single rule 3000 ipv4" || fail "live duplicate/missing 3000 count=$c1"
  sudo iptables -C DOCKER-USER -i eth0 -p tcp -m conntrack --ctstate NEW --ctorigdstport 3000 -j REJECT --reject-with tcp-reset 2>/dev/null \
    || sudo iptables -C DOCKER-USER -i eth0 -p tcp -m conntrack --ctstate NEW --ctorigdstport 3000 -m comment --comment wr-p0-block-3000 -j REJECT --reject-with tcp-reset \
    && pass "live REJECT 3000 present" || fail "live REJECT 3000 missing"
fi

[[ "$FAIL" -eq 0 ]] && echo "RESULT: PASS" && exit 0
echo "RESULT: FAIL count=$FAIL"; exit 1
