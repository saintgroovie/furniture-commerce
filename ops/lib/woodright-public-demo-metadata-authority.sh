#!/usr/bin/env bash
# Metadata-only public_demo authority reconcile (compose WOODRIGHT_RELEASE_SHA +
# ACTIVE_OWNER.approved_git_sha). Never recreates/restarts containers, never
# pulls images, never mutates pins when digests already match.
# shellcheck shell=bash

WR_PD_META_CONFIRM='I_UNDERSTAND_PUBLIC_DEMO_METADATA_AUTHORITY_RECONCILE'

wr_pd_meta_log() { printf '%s wr_pd_meta %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_pd_meta_die() { wr_pd_meta_log "ERROR: $*"; return 1; }

wr_pd_meta_require_full_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || { wr_pd_meta_die "refused non-40-hex SHA for $2: '${1:-}'"; return 1; }
}

wr_pd_meta_require_immutable_ref() {
  local ref="${1:-}" kind="${2:-}"
  [[ "$ref" == ghcr.io/saintgroovie/woodright-*@sha256:* ]] \
    || { wr_pd_meta_die "refused mutable/non-ghcr $kind ref"; return 1; }
  local dig="${ref##*@}"
  [[ "$dig" =~ ^sha256:[0-9a-f]{64}$ ]] || { wr_pd_meta_die "refused non-digest $kind ref"; return 1; }
}

wr_pd_meta_digest_of_ref() {
  local ref="$1"
  printf '%s\n' "${ref##*@}"
}

wr_pd_meta_sha256() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    sha256sum "$path" | awk '{print $1}'
  fi
}

# Read KEY=value from a pin/env file without printing secrets for other keys.
wr_pd_meta_pin_of() {
  local file="$1" key="$2"
  python3 - "$file" "$key" <<'PY'
import re, sys
path, key = sys.argv[1:3]
pat = re.compile(rf'^[ \t]*(?:export[ \t]+)?{re.escape(key)}[ \t]*=(.*)$')
hits = []
for line in open(path, "r", encoding="utf-8"):
    m = pat.match(line.rstrip("\n"))
    if m:
        hits.append(m.group(1))
if len(hits) == 0:
    sys.exit(0)
if len(hits) > 1:
    print(f"DUPLICATE:{key}", file=sys.stderr)
    sys.exit(1)
print(hits[0])
PY
}

wr_pd_meta_oci_of_image_id() {
  local image_id="$1"
  docker image inspect "$image_id" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

# Prints: digest container_id started_at restart_count health image_id
wr_pd_meta_runtime_of() {
  local name="$1"
  docker inspect "$name" --format \
    '{{.Image}} {{.Id}} {{.State.StartedAt}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    2>/dev/null || return 1
}

wr_pd_meta_json_get() {
  local path="$1" key="$2"
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2],"") or "")' "$path" "$key"
}

# Atomic JSON install preserving dest owner/group/mode. Never follows symlink dest.
wr_pd_meta_atomic_install_file() {
  local src="$1" dest="$2" allowed_parent="$3"
  local published meta_u meta_g meta_m
  wr_compose_env_assert_path_under "$dest" "$allowed_parent" || return 1
  wr_compose_env_is_regular_file "$src" || return 1
  if [[ -e "$dest" || -L "$dest" ]]; then
    wr_compose_env_is_regular_file "$dest" || return 1
    meta_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$dest")"
    meta_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$dest")"
    # chmod(1) wants octal digits (e.g. 640), not decimal S_IMODE.
    meta_m="$(python3 -c 'import os,stat,sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$dest")"
  else
    meta_u="$(id -u)"
    meta_g="$(id -g)"
    meta_m="644"
  fi
  published="$(dirname -- "$dest")/.wr-pd-meta-publish-$$-$RANDOM"
  rm -f "$published" 2>/dev/null || true
  [[ ! -L "$published" ]] || { wr_pd_meta_die "publish path is symlink"; return 1; }
  cp -p "$src" "$published" || return 1
  # Preserve canonical dest ownership even when caller is root.
  # If staged already matches target owner, skip chown (macOS non-root chown may fail harmlessly).
  local staged_u staged_g
  staged_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$published")"
  staged_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$published")"
  if [[ "$staged_u" != "$meta_u" || "$staged_g" != "$meta_g" ]]; then
    if ! chown "${meta_u}:${meta_g}" "$published" 2>/dev/null; then
      if command -v sudo >/dev/null 2>&1 && sudo -n chown "${meta_u}:${meta_g}" "$published" 2>/dev/null; then
        :
      else
        rm -f "$published"
        wr_pd_meta_die "chown staged failed (need owner ${meta_u}:${meta_g})"
        return 1
      fi
    fi
  fi
  if ! chmod "$meta_m" "$published" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo -n chmod "$meta_m" "$published" 2>/dev/null; then
      :
    else
      rm -f "$published"
      wr_pd_meta_die "chmod staged failed"
      return 1
    fi
  fi
  if ! mv -f "$published" "$dest" 2>/dev/null; then
    sudo -n mv -f "$published" "$dest" || {
      rm -f "$published" 2>/dev/null || true
      wr_pd_meta_die "atomic mv failed"
      return 1
    }
  fi
  # Post-verify owner/mode
  local got_u got_g got_m
  got_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$dest")"
  got_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$dest")"
  got_m="$(python3 -c 'import os,stat,sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$dest")"
  [[ "$got_u" == "$meta_u" && "$got_g" == "$meta_g" && "$got_m" == "$meta_m" ]] \
    || { wr_pd_meta_die "owner/mode mismatch after install want=${meta_u}:${meta_g}:$meta_m got=${got_u}:${got_g}:$got_m"; return 1; }
  wr_pd_meta_log "atomic_install_ok dest_parent=$(dirname -- "$dest")"
  return 0
}

wr_pd_meta_render_owner_approved() {
  local src="$1" out="$2" want_sha="$3" tooling_sha="${4:-}"
  python3 - "$src" "$out" "$want_sha" "$tooling_sha" <<'PY'
import json, sys
from datetime import datetime, timezone
src, out, want, tooling = sys.argv[1:5]
data = json.load(open(src, encoding="utf-8"))
desired = data.get("desired_git_sha") or ""
be_rev = data.get("backend_revision") or ""
sf_rev = data.get("storefront_revision") or ""
if desired != want:
    print(f"desired_git_sha mismatch have={desired}", file=sys.stderr)
    sys.exit(1)
if be_rev != want or sf_rev != want:
    print(f"running revisions mismatch be={be_rev} sf={sf_rev}", file=sys.stderr)
    sys.exit(1)
data["approved_git_sha"] = want
if tooling:
    # Optional provenance note only; do not invent unknown schema keys blindly.
    data["metadata_reconcile_helper_sha"] = tooling
data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
}

# Core gate set. Sets globals WR_PD_META_* snapshot vars on success.
wr_pd_meta_run_gates() {
  local want_sha="$1"
  local be_ref="$2"
  local sf_ref="$3"
  local be_name="${WOODRIGHT_BE_CONTAINER_DEFAULT:?}"
  local sf_name="${WOODRIGHT_SF_CONTAINER_DEFAULT:?}"
  local compose_env="${WOODRIGHT_COMPOSE_ENV_FILE:?}"
  local pins="${WOODRIGHT_IDENTITY_DIR:?}/DOKPLOY_IMAGE_PINS.env"
  local active_public="${WOODRIGHT_ACTIVE_PUBLIC:?}"
  local active_owner="${WOODRIGHT_ACTIVE_OWNER:?}"
  local expected="${WOODRIGHT_EXPECTED_RELEASE:?}"
  local allowed_root="${WOODRIGHT_DOKPLOY_COMPOSE_DIR:?}"
  local own_dir="${WOODRIGHT_OWNERSHIP_DIR:?}"
  local be_dig sf_dig
  local -a be_rt sf_rt

  [[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] \
    || { wr_pd_meta_die "environment must be public_demo (got ${WOODRIGHT_ENVIRONMENT})"; return 1; }
  [[ "${WOODRIGHT_REQUIRED_DB_ALIAS}" == "public_demo_db" ]] \
    || { wr_pd_meta_die "DB alias profile mismatch"; return 1; }

  wr_pd_meta_require_full_sha "$want_sha" application-source-sha || return 1
  wr_pd_meta_require_immutable_ref "$be_ref" backend || return 1
  wr_pd_meta_require_immutable_ref "$sf_ref" storefront || return 1
  be_dig="$(wr_pd_meta_digest_of_ref "$be_ref")"
  sf_dig="$(wr_pd_meta_digest_of_ref "$sf_ref")"

  wr_compose_env_assert_path_under "$compose_env" "$allowed_root" || return 1
  wr_compose_env_is_regular_file "$compose_env" || return 1
  wr_compose_env_assert_no_duplicate_governed_keys "$compose_env" || return 1
  [[ -f "$pins" ]] || { wr_pd_meta_die "pins missing"; return 1; }
  [[ -f "$active_public" && -f "$active_owner" && -f "$expected" ]] \
    || { wr_pd_meta_die "authority files missing"; return 1; }
  wr_compose_env_is_regular_file "$active_owner" || return 1

  local pin_be pin_sf
  pin_be="$(wr_pd_meta_pin_of "$pins" WOODRIGHT_BACKEND_IMAGE)" \
    || { wr_pd_meta_die "duplicate backend pin"; return 1; }
  pin_sf="$(wr_pd_meta_pin_of "$pins" WOODRIGHT_STOREFRONT_IMAGE)" \
    || { wr_pd_meta_die "duplicate storefront pin"; return 1; }
  [[ "$pin_be" == "$be_ref" ]] || { wr_pd_meta_die "backend pin mismatch"; return 1; }
  [[ "$pin_sf" == "$sf_ref" ]] || { wr_pd_meta_die "storefront pin mismatch"; return 1; }

  # Compose image pins must also match (no digest rewrite planned).
  local c_be c_sf
  c_be="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_BACKEND_IMAGE)" \
    || { wr_pd_meta_die "duplicate compose backend image"; return 1; }
  c_sf="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_STOREFRONT_IMAGE)" \
    || { wr_pd_meta_die "duplicate compose storefront image"; return 1; }
  [[ "$c_be" == "$be_ref" ]] || { wr_pd_meta_die "compose backend image mismatch"; return 1; }
  [[ "$c_sf" == "$sf_ref" ]] || { wr_pd_meta_die "compose storefront image mismatch"; return 1; }

  local be_line sf_line
  local be_img be_id be_start be_restarts be_health
  local sf_img sf_id sf_start sf_restarts sf_health
  be_line="$(wr_pd_meta_runtime_of "$be_name")" \
    || { wr_pd_meta_die "backend container inspect failed"; return 1; }
  sf_line="$(wr_pd_meta_runtime_of "$sf_name")" \
    || { wr_pd_meta_die "storefront container inspect failed"; return 1; }
  # Portable parse (no mapfile; macOS /bin/bash 3.2 + Linux bash 4+)
  read -r be_img be_id be_start be_restarts be_health <<<"$be_line"
  read -r sf_img sf_id sf_start sf_restarts sf_health <<<"$sf_line"
  [[ "$be_img" == "$be_dig" ]] || { wr_pd_meta_die "backend runtime digest mismatch"; return 1; }
  [[ "$sf_img" == "$sf_dig" ]] || { wr_pd_meta_die "storefront runtime digest mismatch"; return 1; }
  [[ "$be_restarts" == "0" && "$sf_restarts" == "0" ]] \
    || { wr_pd_meta_die "restart count non-zero"; return 1; }
  [[ "$be_health" == "healthy" && "$sf_health" == "healthy" ]] \
    || { wr_pd_meta_die "unhealthy container"; return 1; }

  local be_oci sf_oci
  be_oci="$(wr_pd_meta_oci_of_image_id "$be_img")"
  sf_oci="$(wr_pd_meta_oci_of_image_id "$sf_img")"
  [[ "$be_oci" == "$want_sha" ]] || { wr_pd_meta_die "backend OCI revision mismatch"; return 1; }
  [[ "$sf_oci" == "$want_sha" ]] || { wr_pd_meta_die "storefront OCI revision mismatch"; return 1; }

  local ap_role ap_db ap_sha
  ap_role="$(wr_pd_meta_json_get "$active_public" runtime_role)"
  ap_db="$(wr_pd_meta_json_get "$active_public" database_identity_alias)"
  [[ -z "$ap_db" ]] && ap_db="$(wr_pd_meta_json_get "$active_public" database_identity)"
  ap_sha="$(wr_pd_meta_json_get "$active_public" release_sha)"
  [[ "$ap_role" == "public_demo" ]] || { wr_pd_meta_die "ACTIVE_PUBLIC role mismatch"; return 1; }
  [[ "$ap_db" == "public_demo_db" ]] || { wr_pd_meta_die "DB alias mismatch"; return 1; }
  [[ "$ap_sha" == "$want_sha" ]] || { wr_pd_meta_die "ACTIVE_PUBLIC release_sha mismatch"; return 1; }

  local exp_sha
  exp_sha="$(wr_pd_meta_json_get "$expected" application_source_sha)"
  if [[ -z "$exp_sha" ]]; then
    exp_sha="$(wr_pd_meta_json_get "$expected" release_sha)"
  fi
  [[ "$exp_sha" == "$want_sha" ]] || { wr_pd_meta_die "EXPECTED_RELEASE sha mismatch"; return 1; }

  local desired approved be_rev sf_rev
  desired="$(wr_pd_meta_json_get "$active_owner" desired_git_sha)"
  approved="$(wr_pd_meta_json_get "$active_owner" approved_git_sha)"
  be_rev="$(wr_pd_meta_json_get "$active_owner" backend_revision)"
  sf_rev="$(wr_pd_meta_json_get "$active_owner" storefront_revision)"
  [[ "$desired" == "$want_sha" ]] || { wr_pd_meta_die "desired_git_sha mismatch"; return 1; }
  [[ "$be_rev" == "$want_sha" && "$sf_rev" == "$want_sha" ]] \
    || { wr_pd_meta_die "desired/running SHA mismatch (revisions)"; return 1; }

  local run_be run_sf
  run_be="$(wr_pd_meta_json_get "$active_owner" running_backend_digest)"
  run_sf="$(wr_pd_meta_json_get "$active_owner" running_storefront_digest)"
  [[ "$run_be" == "$be_dig" ]] || { wr_pd_meta_die "ACTIVE_OWNER running_backend_digest mismatch"; return 1; }
  [[ "$run_sf" == "$sf_dig" ]] || { wr_pd_meta_die "ACTIVE_OWNER running_storefront_digest mismatch"; return 1; }

  WR_PD_META_BE_ID="$be_id"
  WR_PD_META_SF_ID="$sf_id"
  WR_PD_META_BE_START="$be_start"
  WR_PD_META_SF_START="$sf_start"
  WR_PD_META_BE_DIG="$be_dig"
  WR_PD_META_SF_DIG="$sf_dig"
  WR_PD_META_APPROVED_NOW="$approved"
  WR_PD_META_RELEASE_NOW="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_RELEASE_SHA || true)"
  WR_PD_META_OWN_DIR="$own_dir"
  return 0
}

wr_pd_meta_assert_containers_unchanged() {
  local be_name="${WOODRIGHT_BE_CONTAINER_DEFAULT:?}"
  local sf_name="${WOODRIGHT_SF_CONTAINER_DEFAULT:?}"
  local be_line sf_line
  local be_img be_id be_start be_restarts be_health
  local sf_img sf_id sf_start sf_restarts sf_health
  be_line="$(wr_pd_meta_runtime_of "$be_name")" || return 1
  sf_line="$(wr_pd_meta_runtime_of "$sf_name")" || return 1
  read -r be_img be_id be_start be_restarts be_health <<<"$be_line"
  read -r sf_img sf_id sf_start sf_restarts sf_health <<<"$sf_line"
  [[ "$be_id" == "$WR_PD_META_BE_ID" && "$sf_id" == "$WR_PD_META_SF_ID" ]] \
    || { wr_pd_meta_die "container IDs changed"; return 1; }
  [[ "$be_start" == "$WR_PD_META_BE_START" && "$sf_start" == "$WR_PD_META_SF_START" ]] \
    || { wr_pd_meta_die "container start times changed"; return 1; }
  [[ "$be_img" == "$WR_PD_META_BE_DIG" && "$sf_img" == "$WR_PD_META_SF_DIG" ]] \
    || { wr_pd_meta_die "container digests changed"; return 1; }
  return 0
}
