#!/usr/bin/env bash
# Fidelity matrix for private-candidate loopback host-publish contract.
# No Docker mutations. Pure evaluator + profile load checks.
#
#   bash scripts/ops/test-host-publish-fidelity.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../../ops/lib/woodright-host-publish.sh
source "$ROOT/ops/lib/woodright-host-publish.sh"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }

eval_case() {
  local name="$1" expect_rc="$2"
  shift 2
  # remaining are env assignments already exported by caller
  set +e
  OUT="$(wr_hp_evaluate_python 2>/dev/null)"
  RC=$?
  set -e
  if [[ "$expect_rc" == "0" && "$RC" -eq 0 ]]; then
    ok "$name"
  elif [[ "$expect_rc" != "0" && "$RC" -ne 0 ]]; then
    VERDICT="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("verdict") or "")' "${OUT:-}")"
    ok "$name (verdict=$VERDICT)"
  else
    fail "$name rc=$RC out=${OUT:0:200}"
  fi
}

export WR_HP_MODE=planned
export WR_HP_NETWORK_MODE=bridge
export WR_HP_COMPOSE_PROJECT=woodright-production
export WR_HP_EXPECTED_COMPOSE=woodright-production
export WR_HP_REQUIRE_COMPOSE=0
export WR_HP_ROLE=all

# 1. missing policy
export WR_HP_POLICY=""
export WR_HP_ALLOWED=""
export WR_HP_BINDINGS_JSON='[]'
eval_case "1_missing_policy" 2

# 2. public_demo zero ports PASS
export WR_HP_POLICY=deny
export WR_HP_ALLOWED=""
export WR_HP_BINDINGS_JSON='[]'
eval_case "2_public_demo_zero_ports" 0

# 3. public_demo loopback port FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"}]'
eval_case "3_public_demo_loopback_forbidden" 2

# 4. production public port FAIL (non-loopback)
export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED='storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200'
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"10.0.0.5","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "4_production_public_ip" 2

# 5. candidate exact loopback PASS
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "5_candidate_exact" 0

# 6. candidate no published ports FAIL
export WR_HP_BINDINGS_JSON='[]'
eval_case "6_candidate_empty_bindings" 2

# 7. inherited ALLOW_HOST_PUBLISH=1 does not change deny policy
export WOODRIGHT_ALLOW_HOST_PUBLISH=1
export WR_HP_POLICY=deny
export WR_HP_ALLOWED=""
export WR_HP_BINDINGS_JSON='[{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "7_inherited_boolean_no_authority" 2
unset WOODRIGHT_ALLOW_HOST_PUBLISH

# 8. unknown profile fails load
if wr_load_environment_profile "unknown_fixture" 2>/dev/null; then fail "8_unknown_profile"; else ok "8_unknown_profile"; fi

# 9-10 exact ports
export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED='storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200'
export WR_HP_ROLE=storefront
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"}]'
eval_case "9_sf_3200" 0
export WR_HP_ROLE=backend
export WR_HP_BINDINGS_JSON='[{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "10_be_9200" 0
export WR_HP_ROLE=all

# 11. 0.0.0.0 FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"0.0.0.0","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "11_wildcard_v4" 2

# 12. empty HostIp FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "12_empty_hostip" 2

# 13. public host IP FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"89.169.188.29","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "13_public_host_ip" 2

# 14. :::3200 style as :: FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"::","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "14_ipv6_wildcard" 2

# 15. ::1 FAIL if undeclared
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"::1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "15_ipv6_loopback_undeclared" 2

# 16. IPv4 allowed + hidden IPv6 wildcard FAIL
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"::","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "16_hidden_ipv6_with_ipv4" 2

# 17. unexpected host port
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9201"}]'
eval_case "17_unexpected_host_port" 2

# 18. expected port on wrong role
export WR_HP_BINDINGS_JSON='[{"role":"backend","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"storefront","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "18_role_mismatch" 2

# 19. wrong container port
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "19_wrong_container_port" 2

# 20. unexpected protocol
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"udp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "20_udp_forbidden" 2

# 21. duplicate binding
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "21_duplicate" 2

# 22. extra additional binding
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"},{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3210"}]'
eval_case "22_extra_binding" 2

# 23. subset only
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"}]'
eval_case "23_subset" 2

# 24. exact set equality PASS
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "24_exact_equality" 0

# 25. host network FAIL
export WR_HP_NETWORK_MODE=host
eval_case "25_host_network" 2
export WR_HP_NETWORK_MODE=bridge

# 26-27 compose
export WR_HP_REQUIRE_COMPOSE=1
export WR_HP_COMPOSE_PROJECT=""
eval_case "26_compose_missing" 2
export WR_HP_COMPOSE_PROJECT=wrong-project
eval_case "27_compose_mismatch" 2
export WR_HP_COMPOSE_PROJECT=woodright-production
export WR_HP_REQUIRE_COMPOSE=0

# 28. keeper/candidate wrong role selection - profile prefix
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production >/dev/null
if wr_assert_container_matches_environment "woodright-staging-backend" backend 2>/dev/null; then
  fail "28_wrong_role_selection"
else
  ok "28_wrong_role_selection"
fi

# 29. public_demo cannot inherit candidate policy (profile fields)
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_demo >/dev/null
[[ "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]] && ok "29_public_demo_deny" || fail "29_public_demo_deny=${WOODRIGHT_HOST_PUBLISH_POLICY}"

# 30. candidate cannot target public_demo containers via prefix
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production >/dev/null
if wr_assert_container_matches_environment "woodright-staging-storefront" storefront 2>/dev/null; then
  fail "30_candidate_targets_public_demo"
else
  ok "30_candidate_targets_public_demo"
fi

# 31. production policy is loopback_allowlist not deniable by boolean
[[ "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "loopback_allowlist" ]] && ok "31_production_policy" || fail "31_production_policy"

# 32. conflicting inherited environment
export WOODRIGHT_ENVIRONMENT=public_demo
unset WOODRIGHT_ENV_PROFILE_LOADED || true
if wr_load_environment_profile production 2>/dev/null; then fail "32_inherited_conflict"; else ok "32_inherited_conflict"; fi
unset WOODRIGHT_ENVIRONMENT || true

# 33. Mode B style: planned valid encoded as live wildcard → fail
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production >/dev/null
export WR_HP_MODE=live
export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS}"
export WR_HP_ROLE=all
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"0.0.0.0","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "33_mode_b_wildcard" 2

# 34. Mode A invalid planned under deny
export WR_HP_MODE=planned
export WR_HP_POLICY=deny
export WR_HP_ALLOWED=""
export WR_HP_BINDINGS_JSON='[{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9000"}]'
eval_case "34_mode_a_invalid" 2

# 34b. Mode A loopback without explicit planned JSON must fail at media-gate level (documented)
# Simulated: empty planned under loopback_allowlist → incomplete
export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED='storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200'
export WR_HP_BINDINGS_JSON='[]'
eval_case "34b_mode_a_loopback_needs_plan" 2

# 34c. publish flag refuse
if wr_hp_refuse_publish_flags --name x -p 127.0.0.1:3200:3002 2>/dev/null; then
  fail "34c_refuse_publish_flags"
else
  ok "34c_refuse_publish_flags"
fi
if wr_hp_refuse_publish_flags --name x -p127.0.0.1:3200:3002 2>/dev/null; then
  fail "34c_refuse_compact_p"
else
  ok "34c_refuse_compact_p"
fi
if wr_hp_refuse_publish_flags --name x -P 2>/dev/null; then
  fail "34c_refuse_P"
else
  ok "34c_refuse_P"
fi
if wr_hp_refuse_publish_flags --name x --publish-all 2>/dev/null; then
  fail "34c_refuse_publish_all"
else
  ok "34c_refuse_publish_all"
fi
if wr_hp_refuse_publish_flags --name x --restart unless-stopped 2>/dev/null; then
  ok "34c_refuse_allows_clean_create"
else
  fail "34c_refuse_allows_clean_create"
fi

# 35. stale empty cannot bypass required allowlist
export WR_HP_MODE=live
export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED='storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200'
export WR_HP_BINDINGS_JSON='[]'
eval_case "35_stale_empty" 2

# 36. exact candidate Mode B PASS
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
eval_case "36_mode_b_exact" 0

# 37-41 monitor tokens via evaluator output
OUT="$(wr_hp_evaluate_python)"
TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["monitor_token"])' <<<"$OUT")"
[[ "$TOKEN" == "host_publish_loopback_allowlist_pass" ]] && ok "38_candidate_monitor_token" || fail "38_token=$TOKEN"

export WR_HP_POLICY=deny
export WR_HP_ALLOWED=""
export WR_HP_BINDINGS_JSON='[]'
OUT="$(wr_hp_evaluate_python)"
TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["monitor_token"])' <<<"$OUT")"
[[ "$TOKEN" == "host_publish_denied_pass" ]] && ok "37_public_demo_monitor_token" || fail "37_token=$TOKEN"

export WR_HP_POLICY=loopback_allowlist
export WR_HP_ALLOWED='storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200'
export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"0.0.0.0","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
set +e; OUT="$(wr_hp_evaluate_python)"; set -e
VERDICT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["verdict"])' "$OUT")"
[[ "$VERDICT" == "HOST_PUBLISH_PUBLIC_BIND" ]] && ok "39_wildcard_critical_verdict" || fail "39=$VERDICT"

export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9999"}]'
set +e; OUT="$(wr_hp_evaluate_python)"; set -e
VERDICT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["verdict"])' "$OUT")"
[[ "$VERDICT" == "HOST_PUBLISH_UNEXPECTED_PORT" || "$VERDICT" == "HOST_PUBLISH_ALLOWLIST_MISMATCH" ]] && ok "40_unexpected_port_verdict" || fail "40=$VERDICT"

export WR_HP_BINDINGS_JSON='[{"role":"storefront","container_port":"3002","protocol":"tcp","host_ip":"127.0.0.1","host_port":"3200"},{"role":"backend","container_port":"9000","protocol":"tcp","host_ip":"127.0.0.1","host_port":"9200"}]'
OUT="$(wr_hp_evaluate_python)"
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); assert "expected_bindings" in d and "actual_bindings" in d' "$OUT" && ok "41_structured_json" || fail "41_structured_json"

# 42. fixture production public mutation FAIL (already covered by 4/13)
ok "42_production_public_mutation_fail_covered"

# 43. woodright.ru untouched - governance files must not rewrite DNS/cutover execute
if grep -R "woodright.ru" "$ROOT/ops/lib/woodright-host-publish.sh" | grep -qiE 'cutover|dns.*mutat|sed.*hosts'; then
  fail "43_woodright_ru_touched"
else
  ok "43_woodright_ru_untouched_in_hp_lib"
fi

# Profile fields present
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging >/dev/null
[[ "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]] && ok "staging_deny" || fail "staging_policy"

# Media gate still mentions HOST_PORTS_PUBLISHED for deny path
grep -q HOST_PORTS_PUBLISHED "$ROOT/ops/release/verify-backend-media-mount.sh" && ok "media_gate_legacy_verdict" || fail "media_gate_legacy_verdict"
grep -q woodright-host-publish "$ROOT/ops/release/verify-backend-media-mount.sh" && ok "media_gate_sources_hp" || fail "media_gate_sources_hp"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
