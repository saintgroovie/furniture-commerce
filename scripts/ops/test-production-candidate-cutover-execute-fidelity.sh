#!/usr/bin/env bash
# Fidelity tests for the PRIVATE production-candidate execute path
# (ops/release/cutover-production-candidate.sh).
#
# Everything runs against a throwaway filesystem under /tmp with a fake docker
# / docker compose shim. No real container, pin file, lock or VM is touched,
# and the public_demo roots are asserted to stay byte-identical throughout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/cutover-production-candidate.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/production.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# Real path (macOS /tmp -> /private/tmp): the profile loader resolves the
# profile with realpath and requires it to stay inside WOODRIGHT_ENV_PROFILE_DIR.
TMP="$(cd "$(mktemp -d /tmp/wr-prod-cutover-exec-XXXXXX)" && pwd -P)"
cleanup() {
  if [[ "$FAILED" -eq 0 ]]; then
    rm -rf "$TMP"
  else
    echo "harness kept for inspection: $TMP"
  fi
}
trap cleanup EXIT

BIN="$TMP/bin"
STATE="$TMP/state"
PROFILES="$TMP/profiles"
SRV="$TMP/srv/woodright"
COMPOSE_DIR="$TMP/etc/dokploy/compose/woodright-production/code"
ENV_FILE="$COMPOSE_DIR/.env"
OWN_DIR="$SRV/runtime-ownership-production"
PD_OWN_DIR="$SRV/runtime-ownership-public-demo"
PD_ID_DIR="$SRV/runtime-identity-public-demo"
PD_LOCK="$SRV/locks/public_demo/live-cutover.lock"
LOCK="$SRV/locks/production/live-cutover.lock"
CONF="$PROFILES/production.conf"

APP_SHA="1111111111111111111111111111111111111111"
HELPER_SHA="2222222222222222222222222222222222222222"
NEW_BE_DIG="sha256:$(printf 'a%.0s' {1..64})"
NEW_SF_DIG="sha256:$(printf 'b%.0s' {1..64})"
OLD_BE_DIG="sha256:$(printf 'c%.0s' {1..64})"
OLD_SF_DIG="sha256:$(printf 'd%.0s' {1..64})"
BE_REF="ghcr.io/saintgroovie/woodright-backend@${NEW_BE_DIG}"
SF_REF="ghcr.io/saintgroovie/woodright-storefront@${NEW_SF_DIG}"
OLD_BE_REF="ghcr.io/saintgroovie/woodright-backend@${OLD_BE_DIG}"
OLD_SF_REF="ghcr.io/saintgroovie/woodright-storefront@${OLD_SF_DIG}"
CONFIRM="I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER"
MEDIA_VOL="woodright-production_woodright-production_media"

mkdir -p "$BIN" "$STATE" "$PROFILES" "$COMPOSE_DIR" "$OWN_DIR" \
  "$SRV/locks/production" "$SRV/locks/public_demo" "$SRV/reports/production" \
  "$PD_OWN_DIR" "$PD_ID_DIR" "$SRV/runtime-identity-production"

# --------------------------------------------------------------------------
# Production profile: the real conf with every absolute path re-rooted in TMP.
# --------------------------------------------------------------------------
sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"
grep -q "WOODRIGHT_MUTATION_LOCK_PATH=${LOCK}$" "$CONF" \
  && pass "harness profile re-roots the production lock into TMP" \
  || fail "harness profile lock path not re-rooted"
grep -q "WOODRIGHT_COMPOSE_ENV_FILE=${ENV_FILE}$" "$CONF" \
  && pass "harness profile re-roots the compose .env into TMP" \
  || fail "harness profile compose .env not re-rooted"

printf 'services:\n  backend: {}\n  storefront: {}\n  postgres: {}\n  redis: {}\n' \
  >"$COMPOSE_DIR/docker-compose.yml"
: >"$LOCK"
: >"$PD_LOCK"

# --------------------------------------------------------------------------
# fake docker
# --------------------------------------------------------------------------
cat >"$BIN/docker" <<'DOCKER_EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
mkdir -p "$STATE/containers" "$STATE/images" "$STATE/volumes" "$STATE/log"
printf 'docker %s\n' "$*" >>"$STATE/log/commands.log"

# Go-template rendering is served from a flat "path<TAB>value" projection of
# the document. The projection is rebuilt only when the JSON changes, so the
# hot inspect path costs one awk instead of one python interpreter start.
project() {
  local json="$1" props="$2"
  # Writers drop the projection explicitly (mtime granularity is too coarse
  # to be trusted for same-second rewrites).
  [[ -f "$props" ]] && return 0
  python3 - "$json" "$props" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1]))
obj = doc[0] if isinstance(doc, list) else doc
rows = []

def scalar(v):
    if v is True:
        return "true"
    if v is False:
        return "false"
    return "" if v is None else str(v)

def emit(path, node):
    if isinstance(node, (dict, list)):
        rows.append(("json:" + path, json.dumps(node)))
        items = node.items() if isinstance(node, dict) else enumerate(node)
        for key, value in items:
            emit(f"{path}.{key}", value)
    else:
        rows.append((path, scalar(node)))

emit("", obj)
with open(sys.argv[2], "w", encoding="utf-8") as fh:
    for key, value in rows:
        fh.write(f"{key}\t{value}\n")
PY
}

render() {
  local json="$1" fmt="$2"
  local props="${json%.json}.props"
  project "$json" "$props"
  RENDER_JSON="$json" RENDER_PROPS="$props" awk -v fmt="$fmt" '
    BEGIN { FS = "\t" }
    { if (!($1 in seen)) { seen[$1] = 1; val[$1] = $2 } }
    END {
      out = ""
      rest = fmt
      while (match(rest, /\{\{[^}]*\}\}/)) {
        out = out substr(rest, 1, RSTART - 1)
        tok = substr(rest, RSTART + 2, RLENGTH - 4)
        rest = substr(rest, RSTART + RLENGTH)
        gsub(/^[ \t]+|[ \t]+$/, "", tok)
        key = ""
        kind = "scalar"
        if (tok ~ /^index[ \t]+\./) {
          sub(/^index[ \t]+/, "", tok)
          split(tok, parts, /[ \t]+/)
          arg = parts[2]
          gsub(/"/, "", arg)
          key = parts[1] "." arg
          kind = "index"
        } else if (tok ~ /^json[ \t]+\./) {
          sub(/^json[ \t]+/, "", tok)
          key = "json:" tok
          kind = "json"
        } else if (tok ~ /^\./) {
          key = tok
        } else {
          key = "__unsupported__"
        }
        if (key in val) {
          out = out val[key]
        } else if (kind == "index") {
          out = out ""
        } else if (kind == "json") {
          out = out "null"
        } else {
          out = out "<no value>"
        }
      }
      print out rest
    }
  ' "$props"
}

require_mutation() {
  if [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" != "1" ]]; then
    echo "UNEXPECTED_MUTATION $*" >&2
    exit 99
  fi
  printf '%s\n' "$*" >>"$STATE/log/mutations.log"
  printf '%s\n' "$*" >>"$STATE/log/journal.log"
}

image_key() { printf '%s' "${1//\//_}"; }

cmd="${1:-}"
shift || true

case "$cmd" in
  inspect|"image")
    if [[ "$cmd" == "image" ]]; then
      [[ "${1:-}" == "inspect" ]] || exit 1
      shift
    fi
    fmt=""
    target=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    f="$STATE/containers/${target#/}.json"
    [[ -f "$f" ]] || f="$STATE/images/$(image_key "$target").json"
    [[ -f "$f" ]] || exit 1
    if [[ -n "$fmt" ]]; then render "$f" "$fmt"; else cat "$f"; fi
    ;;
  volume)
    [[ "${1:-}" == "inspect" ]] || exit 1
    shift
    [[ -f "$STATE/volumes/${1:-}.ok" ]] || exit 1
    echo '[{"Name":"'"$1"'"}]'
    ;;
  compose)
    exec "${WOODRIGHT_FAKE_COMPOSE_BIN:?}" "$@"
    ;;
  rename)
    require_mutation "rename $1 $2"
    src="$STATE/containers/${1#/}.json"
    dst="$STATE/containers/${2#/}.json"
    [[ -f "$src" ]] || exit 1
    rm -f "${src%.json}.props" "${dst%.json}.props"
    python3 - "$src" "$dst" "$2" <<'PY'
import json, os, sys
src, dst, name = sys.argv[1:4]
d = json.load(open(src))
obj = d[0] if isinstance(d, list) else d
obj["Name"] = "/" + name.lstrip("/")
json.dump(d, open(dst, "w"))
os.remove(src)
PY
    ;;
  stop|start)
    require_mutation "$cmd $1"
    f="$STATE/containers/${1#/}.json"
    [[ -f "$f" ]] || exit 1
    rm -f "${f%.json}.props"
    python3 - "$f" "$cmd" <<'PY'
import json, sys
f, action = sys.argv[1:3]
d = json.load(open(f))
obj = d[0] if isinstance(d, list) else d
st = obj.setdefault("State", {})
if action == "stop":
    st["Status"] = "exited"
    if isinstance(st.get("Health"), dict):
        st["Health"]["Status"] = "unhealthy"
else:
    st["Status"] = "running"
    if isinstance(st.get("Health"), dict):
        st["Health"]["Status"] = "healthy"
json.dump(d, open(f, "w"))
PY
    ;;
  rm)
    args=()
    for a in "$@"; do [[ "$a" == -* ]] || args+=("$a"); done
    require_mutation "rm ${args[*]}"
    for a in "${args[@]}"; do rm -f "$STATE/containers/${a#/}.json" "$STATE/containers/${a#/}.props"; done
    ;;
  *)
    exit 0
    ;;
esac
DOCKER_EOF
chmod +x "$BIN/docker"

# --------------------------------------------------------------------------
# fake docker compose
# --------------------------------------------------------------------------
cat >"$BIN/compose" <<'COMPOSE_EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
mkdir -p "$STATE/log" "$STATE/containers"
printf 'compose %s\n' "$*" >>"$STATE/log/commands.log"

env_file=""; project=""; compose_file=""; service=""; up=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file) compose_file="$2"; shift 2 ;;
    --env-file) env_file="$2"; shift 2 ;;
    --project-name|-p) project="$2"; shift 2 ;;
    up) up=1; shift ;;
    -d|--detach|--no-deps) shift ;;
    *) service="$1"; shift ;;
  esac
done
[[ "$up" == "1" ]] || exit 0
[[ -f "$compose_file" ]] || { echo "compose file missing: $compose_file" >&2; exit 1; }
[[ -f "$env_file" ]] || { echo "env file missing: $env_file" >&2; exit 1; }
if [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" != "1" ]]; then
  echo "UNEXPECTED_MUTATION compose up $service" >&2
  exit 99
fi
printf 'compose_up %s project=%s\n' "$service" "$project" >>"$STATE/log/mutations.log"
printf 'compose_up %s\n' "$service" >>"$STATE/log/journal.log"
if [[ "${WOODRIGHT_FAKE_COMPOSE_FAIL:-}" == "$service" ]]; then
  echo "harness: compose up $service failed" >&2
  exit 1
fi

python3 - "$STATE" "$env_file" "$service" <<'PY'
import json, os, sys
state, env_file, service = sys.argv[1:4]
pins = {}
for line in open(env_file, encoding="utf-8"):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.rstrip("\n").split("=", 1)
        pins[k] = v
key = "WOODRIGHT_BACKEND_IMAGE" if service == "backend" else "WOODRIGHT_STOREFRONT_IMAGE"
image = pins.get(key, "")
digest = image.split("@")[-1]
if os.environ.get("WOODRIGHT_FAKE_COMPOSE_WRONG_DIGEST") == service:
    digest = "sha256:" + ("9" * 64)
    image = image.split("@")[0] + "@" + digest
name = f"woodright-production-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
host_ip = "0.0.0.0" if os.environ.get("WOODRIGHT_FAKE_COMPOSE_PUBLIC_BIND") == service else "127.0.0.1"
host_port = "9200" if service == "backend" else "3200"
container_port = "9000/tcp" if service == "backend" else "3000/tcp"
health = "unhealthy" if os.environ.get("WOODRIGHT_FAKE_COMPOSE_UNHEALTHY") == service else "healthy"
labels = {
    "com.woodright.deployment-owner": "Dokploy",
    "com.woodright.exposure": "private",
    "com.woodright.database-identity": "non_public_candidate_db",
    "org.opencontainers.image.title": title,
    "com.docker.compose.project": "woodright-production",
    "com.woodright.release-sha": os.environ.get("WOODRIGHT_FAKE_RELEASE_SHA", ""),
}
if os.environ.get("WOODRIGHT_FAKE_COMPOSE_PUBLIC_TRAEFIK") == service:
    labels["traefik.enable"] = "true"
    labels["traefik.http.routers.wr.rule"] = "Host(`woodright.ru`)"
doc = [{
    "Id": f"id-{service}-new",
    "Name": f"/{name}",
    "Image": digest,
    "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{digest}"],
    "RestartCount": 0,
    "Config": {
        "Image": image,
        "Env": [
            "WOODRIGHT_EXPOSURE=private",
            "WOODRIGHT_DATABASE_IDENTITY_ALIAS=non_public_candidate_db",
            "PGPASSWORD=MOCK_SECRET_VALUE",
        ],
        "Labels": labels,
        "Healthcheck": {"Test": ["CMD-SHELL", "true"]},
    },
    "HostConfig": {
        "Binds": [],
        "PortBindings": {container_port: [{"HostIp": host_ip, "HostPort": host_port}]},
    },
    "Mounts": (
        [{"Type": "volume", "Name": "woodright-production_woodright-production_media",
          "Destination": "/server/static"}] if service == "backend" else []
    ),
    "State": {"Status": "running", "Health": {"Status": health}},
    "NetworkSettings": {"Networks": {"dokploy-network": {}}, "Ports": {}},
}]
json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
PY
COMPOSE_EOF
chmod +x "$BIN/compose"

# --------------------------------------------------------------------------
# fake http probe
# --------------------------------------------------------------------------
cat >"$BIN/http" <<'HTTP_EOF'
#!/usr/bin/env bash
url="${1:-}"
if [[ -n "${WOODRIGHT_FAKE_HTTP_FAIL:-}" && "$url" == *"${WOODRIGHT_FAKE_HTTP_FAIL}"* ]]; then
  echo 503
  exit 0
fi
echo 200
HTTP_EOF
chmod +x "$BIN/http"

# --------------------------------------------------------------------------
# harness state helpers
# --------------------------------------------------------------------------
write_container() {
  local service="$1" digest="$2" host_ip="${3:-127.0.0.1}" traefik="${4:-0}"
  python3 - "$STATE" "$service" "$digest" "$host_ip" "$traefik" <<'PY'
import json, os, sys
state, service, digest, host_ip, traefik = sys.argv[1:6]
name = f"woodright-production-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
labels = {
    "com.woodright.deployment-owner": "Dokploy",
    "com.woodright.exposure": "private",
    "com.woodright.database-identity": "non_public_candidate_db",
    "org.opencontainers.image.title": title,
    "com.docker.compose.project": "woodright-production",
}
if traefik == "1":
    labels["traefik.enable"] = "true"
    labels["traefik.http.routers.wr.rule"] = "Host(`woodright.ru`)"
doc = [{
    "Id": f"id-{service}-live",
    "Name": f"/{name}",
    "Image": digest,
    "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{digest}"],
    "RestartCount": 0,
    "Config": {
        "Image": f"ghcr.io/saintgroovie/{title}@{digest}",
        "Env": [
            "WOODRIGHT_EXPOSURE=private",
            "WOODRIGHT_DATABASE_IDENTITY_ALIAS=non_public_candidate_db",
            "PGPASSWORD=MOCK_SECRET_VALUE",
        ],
        "Labels": labels,
        "Healthcheck": {"Test": ["CMD-SHELL", "true"]},
    },
    "HostConfig": {
        "Binds": [],
        "PortBindings": {
            ("9000/tcp" if service == "backend" else "3000/tcp"): [
                {"HostIp": host_ip, "HostPort": ("9200" if service == "backend" else "3200")}
            ]
        },
    },
    "Mounts": (
        [{"Type": "volume", "Name": "woodright-production_woodright-production_media",
          "Destination": "/server/static"}] if service == "backend" else []
    ),
    "State": {"Status": "running", "Health": {"Status": "healthy"}},
    "NetworkSettings": {"Networks": {"dokploy-network": {}}, "Ports": {}},
}]
json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
PY
}

write_image() {
  local ref="$1" title="$2" profile="${3:-production_candidate}" revision="${4:-$APP_SHA}"
  python3 - "$STATE" "$ref" "$title" "$profile" "$revision" <<'PY'
import json, os, sys
state, ref, title, profile, revision = sys.argv[1:6]
doc = {
    "Id": ref.split("@")[-1],
    "RepoDigests": [ref],
    "Config": {
        "Labels": {
            "org.opencontainers.image.revision": revision,
            "org.opencontainers.image.title": title,
            "woodright.image.build_profile": profile,
            "com.woodright.deployment-owner": "Dokploy",
        }
    },
}
json.dump(doc, open(os.path.join(state, "images", ref.replace("/", "_") + ".json"), "w"))
PY
}

reset_harness() {
  rm -rf "$STATE"
  mkdir -p "$STATE/containers" "$STATE/images" "$STATE/volumes" "$STATE/log"
  touch "$STATE/volumes/${MEDIA_VOL}.ok"
  write_container backend "$OLD_BE_DIG"
  write_container storefront "$OLD_SF_DIG"
  # A public_demo container exists on the host and must never be selected.
  python3 - "$STATE" <<'PY'
import json, os, sys
state = sys.argv[1]
for name in ("woodright-staging-backend", "woodright-staging-storefront"):
    doc = [{"Id": f"id-{name}", "Name": f"/{name}",
            "Config": {"Image": "ghcr.io/x@sha256:" + "e" * 64, "Labels": {
                "com.woodright.runtime-role": "public_demo"}},
            "State": {"Status": "running"}}]
    json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
PY
  write_image "$BE_REF" woodright-backend
  write_image "$SF_REF" woodright-storefront
  write_image "$OLD_BE_REF" woodright-backend production_candidate "0000000000000000000000000000000000000000"
  write_image "$OLD_SF_REF" woodright-storefront production_candidate "0000000000000000000000000000000000000000"

  mkdir -p "$COMPOSE_DIR"
  cat >"$ENV_FILE" <<EOF
# Dokploy compose environment (harness copy)
WOODRIGHT_BACKEND_IMAGE=${OLD_BE_REF}
WOODRIGHT_STOREFRONT_IMAGE=${OLD_SF_REF}
POSTGRES_PASSWORD=MOCK_SECRET_VALUE
UNRELATED_KEY=keep-me
EOF

  rm -rf "$OWN_DIR"
  mkdir -p "$OWN_DIR"
  printf '{"schema":"pre-existing","application_source_sha":"0000000000000000000000000000000000000000"}\n' \
    >"$OWN_DIR/ACTIVE_RELEASE.json"

  # public_demo canaries
  rm -rf "$PD_OWN_DIR" "$PD_ID_DIR"
  mkdir -p "$PD_OWN_DIR" "$PD_ID_DIR"
  printf '{"env":"public_demo","untouched":true}\n' >"$PD_OWN_DIR/ACTIVE_OWNER.json"
  printf '{"env":"public_demo","untouched":true}\n' >"$PD_ID_DIR/ACTIVE_PUBLIC.json"
  PD_CANARY="$(cat "$PD_OWN_DIR/ACTIVE_OWNER.json" "$PD_ID_DIR/ACTIVE_PUBLIC.json" "$PD_LOCK")"
}

pin_of() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print; exit}' "$ENV_FILE"; }
digest_of() {
  WOODRIGHT_FAKE_DOCKER_STATE="$STATE" "$BIN/docker" inspect "$1" --format '{{.Config.Image}}' 2>/dev/null \
    | grep -oE 'sha256:[0-9a-f]{64}' | head -1 || true
}
id_of() {
  WOODRIGHT_FAKE_DOCKER_STATE="$STATE" "$BIN/docker" inspect "$1" --format '{{.Id}}' 2>/dev/null || true
}
container_exists() { [[ -f "$STATE/containers/$1.json" ]]; }
keeper_count() { find "$STATE/containers" -name '*keeper*' | wc -l | tr -d ' '; }

assert_public_demo_untouched() {
  local label="$1" now
  now="$(cat "$PD_OWN_DIR/ACTIVE_OWNER.json" "$PD_ID_DIR/ACTIVE_PUBLIC.json" "$PD_LOCK")"
  if [[ "$now" == "$PD_CANARY" ]]; then
    pass "$label: public_demo roots untouched"
  else
    fail "$label: public_demo roots changed"
  fi
  if grep -qE 'staging|public-demo|public_demo' "$STATE/log/commands.log" 2>/dev/null; then
    fail "$label: public_demo containers were addressed by docker"
  else
    pass "$label: no public_demo container was ever selected"
  fi
}

lock_is_free() {
  python3 - "$1" <<'PY'
import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(1)
sys.exit(0)
PY
}

base_env() {
  printf '%s\n' \
    "PATH=$BIN:$PATH" \
    "WOODRIGHT_ENV_PROFILE_DIR=$PROFILES" \
    "WOODRIGHT_DOCKER_BIN=$BIN/docker" \
    "WOODRIGHT_FAKE_DOCKER_STATE=$STATE" \
    "WOODRIGHT_FAKE_COMPOSE_BIN=$BIN/compose" \
    "WOODRIGHT_CUTOVER_HARNESS=1" \
    "WOODRIGHT_FAKE_HTTP_BIN=$BIN/http" \
    "WOODRIGHT_HELPER_INSTALL_SHA=$HELPER_SHA" \
    "WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1" \
    "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=5"
}

# run_exec <evidence-dir> <out-file> [extra env assignments...]
RC=0
run_exec() {
  local ev="$1" out="$2"
  shift 2
  local -a envs=()
  while IFS= read -r line; do envs+=("$line"); done < <(base_env)
  envs+=("WOODRIGHT_EVIDENCE_DIR=$ev" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1")
  local a
  for a in "$@"; do envs+=("$a"); done
  set +e
  env "${envs[@]}" bash "$SCRIPT" \
    --environment production --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
    --mode execute --confirm-mutation "$CONFIRM" >"$out" 2>&1
  RC=$?
  set -e
}

state_file() { cat "$1/state.txt" 2>/dev/null || echo "<none>"; }

# ==========================================================================
# 1) successful pair execute
# ==========================================================================
reset_harness
EV="$TMP/ev-success"
run_exec "$EV" "$TMP/out-success.txt"
[[ "$RC" -eq 0 ]] && pass "success: exit 0" || { fail "success: rc=$RC"; sed -n '1,60p' "$TMP/out-success.txt"; }
[[ "$(state_file "$EV")" == "committed" ]] && pass "success: state committed" || fail "success: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$BE_REF" ]] && pass "success: backend pin advanced" || fail "success: backend pin=$(pin_of WOODRIGHT_BACKEND_IMAGE)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$SF_REF" ]] && pass "success: storefront pin advanced" || fail "success: storefront pin"
[[ "$(pin_of UNRELATED_KEY)" == "keep-me" ]] && pass "success: unrelated compose keys preserved" || fail "success: unrelated key lost"
[[ "$(digest_of woodright-production-backend)" == "$NEW_BE_DIG" ]] && pass "success: backend runs the new digest" || fail "success: backend digest"
[[ "$(digest_of woodright-production-storefront)" == "$NEW_SF_DIG" ]] && pass "success: storefront runs the new digest" || fail "success: storefront digest"

EXPECTED_STATES=$'prepared\npins_written\ncontainers_recreated\nhealth_passed\nacceptance_passed\ncommitted'
ACTUAL_STATES="$(awk '{print $2}' "$EV/state-transitions.log" | awk '!seen[$0]++')"
[[ "$ACTUAL_STATES" == "$EXPECTED_STATES" ]] \
  && pass "success: state machine order prepared->pins->recreate->health->acceptance->commit" \
  || fail "success: state order = $(echo "$ACTUAL_STATES" | tr '\n' ',')"

JOURNAL="$(cat "$STATE/log/journal.log")"
EXPECTED_JOURNAL=$'rename woodright-production-backend woodright-production-backend-keeper*\ncompose_up backend\nrename woodright-production-storefront woodright-production-storefront-keeper*\ncompose_up storefront'
if [[ "$(echo "$JOURNAL" | sed -n '2p')" == "compose_up backend" \
   && "$(echo "$JOURNAL" | sed -n '4p')" == "compose_up storefront" \
   && "$(echo "$JOURNAL" | sed -n '1p')" == rename\ woodright-production-backend\ * \
   && "$(echo "$JOURNAL" | sed -n '3p')" == rename\ woodright-production-storefront\ * ]]; then
  pass "success: keeper rename then compose up, backend before storefront"
else
  fail "success: mutation order = $(echo "$JOURNAL" | tr '\n' '|')"
fi
if grep -qE 'postgres|redis' "$STATE/log/mutations.log"; then
  fail "success: postgres/redis were touched"
else
  pass "success: postgres/redis never recreated"
fi
grep -q '"application_source_sha": "'"$APP_SHA"'"' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "success: ACTIVE_RELEASE carries the application SHA" || fail "success: ACTIVE_RELEASE app sha"
grep -q '"helper_install_sha": "'"$HELPER_SHA"'"' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "success: ACTIVE_RELEASE carries the helper SHA separately" || fail "success: ACTIVE_RELEASE helper sha"
for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  [[ -f "$OWN_DIR/$f" ]] || fail "success: missing $f"
done
pass "success: scoped ownership metadata written"
lock_is_free "$LOCK" && pass "success: production lock released" || fail "success: lock still held"
grep -q 'application_source_sha=' "${LOCK}.meta" && pass "success: lock metadata records both SHAs" || fail "success: lock metadata"
grep -q "helper_install_sha=$HELPER_SHA" "${LOCK}.meta" && pass "success: lock metadata names the helper SHA" || fail "success: lock metadata helper sha"
if grep -rl 'MOCK_SECRET_VALUE' "$EV" 2>/dev/null | grep -v '/pin-backup/' | grep -q .; then
  fail "success: secret material leaked outside the pin backup"
else
  pass "success: no secret material outside the pin backup"
fi
assert_public_demo_untouched "success"

# ==========================================================================
# 2) first pin write fails -> no recreate, original pins
# ==========================================================================
reset_harness
EV="$TMP/ev-first-pin"
run_exec "$EV" "$TMP/out-first-pin.txt" "WOODRIGHT_CUTOVER_FAULT=first_pin"
[[ "$RC" -ne 0 ]] && pass "first_pin: non-zero exit ($RC)" || fail "first_pin: unexpected success"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "first_pin: failed_before_mutation" || fail "first_pin: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "first_pin: backend pin untouched" || fail "first_pin: backend pin changed"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "first_pin: storefront pin untouched" || fail "first_pin: storefront pin changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "first_pin: nothing recreated" || fail "first_pin: docker mutated"
lock_is_free "$LOCK" && pass "first_pin: lock released" || fail "first_pin: lock held"

# ==========================================================================
# 3) second_pin fault (legacy name) - with atomic pair pin write this fails
#    BEFORE any live install, same as first_pin (no mixed pins possible).
# ==========================================================================
reset_harness
EV="$TMP/ev-second-pin"
run_exec "$EV" "$TMP/out-second-pin.txt" "WOODRIGHT_CUTOVER_FAULT=second_pin"
[[ "$RC" -ne 0 ]] && pass "second_pin: non-zero exit ($RC)" || fail "second_pin: unexpected success"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "second_pin: failed_before_mutation (atomic, no mixed pins)" || fail "second_pin: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "second_pin: backend pin untouched" || fail "second_pin: backend pin changed"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "second_pin: storefront pin untouched" || fail "second_pin: storefront pin"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "second_pin: nothing recreated" || fail "second_pin: docker mutated"
lock_is_free "$LOCK" && pass "second_pin: lock released" || fail "second_pin: lock held"

# ==========================================================================
# 4) backend recreate fails -> rollback pins + keeper
# ==========================================================================
reset_harness
EV="$TMP/ev-be-recreate"
run_exec "$EV" "$TMP/out-be-recreate.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=backend"
[[ "$RC" -eq 10 ]] && pass "backend_recreate: rollback_ok exit 10" || fail "backend_recreate: rc=$RC"
[[ "$(state_file "$EV")" == "rolled_back" ]] && pass "backend_recreate: rolled_back" || fail "backend_recreate: state"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "backend_recreate: pins restored" || fail "backend_recreate: pins not restored"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "backend_recreate: keeper restored live" || fail "backend_recreate: live digest wrong"
[[ "$(id_of woodright-production-backend)" == "id-backend-live" ]] && pass "backend_recreate: original container id back in place" || fail "backend_recreate: id mismatch"
[[ "$(keeper_count)" == "0" ]] && pass "backend_recreate: keeper consumed" || fail "backend_recreate: keeper left behind"
container_exists woodright-production-storefront && pass "backend_recreate: storefront never touched" || fail "backend_recreate: storefront missing"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "backend_recreate: storefront digest unchanged" || fail "backend_recreate: storefront digest"
lock_is_free "$LOCK" && pass "backend_recreate: lock released" || fail "backend_recreate: lock held"

# ==========================================================================
# 5) backend unhealthy -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-be-health"
run_exec "$EV" "$TMP/out-be-health.txt" "WOODRIGHT_FAKE_COMPOSE_UNHEALTHY=backend"
[[ "$RC" -eq 10 ]] && pass "backend_health: rollback_ok exit 10" || fail "backend_health: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "backend_health: backend rolled back" || fail "backend_health: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "backend_health: pins restored" || fail "backend_health: pins"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "backend_health: no ACTIVE written before health passed" || fail "backend_health: ACTIVE_OWNER written"

# ==========================================================================
# 6) storefront recreate fails -> pair rollback (backend too)
# ==========================================================================
reset_harness
EV="$TMP/ev-sf-recreate"
run_exec "$EV" "$TMP/out-sf-recreate.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=storefront"
[[ "$RC" -eq 10 ]] && pass "storefront_recreate: rollback_ok exit 10" || fail "storefront_recreate: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "storefront_recreate: backend rolled back too" || fail "storefront_recreate: backend digest"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "storefront_recreate: storefront restored" || fail "storefront_recreate: storefront digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "storefront_recreate: pins restored" || fail "storefront_recreate: pins"
[[ "$(keeper_count)" == "0" ]] && pass "storefront_recreate: both keepers consumed" || fail "storefront_recreate: keepers left"

# ==========================================================================
# 7) storefront route/http fails -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-sf-http"
run_exec "$EV" "$TMP/out-sf-http.txt" "WOODRIGHT_FAKE_HTTP_FAIL=3200"
[[ "$RC" -eq 10 ]] && pass "storefront_http: rollback_ok exit 10" || fail "storefront_http: rc=$RC"
grep -q 'http gate FAILED storefront' "$TMP/out-sf-http.txt" && pass "storefront_http: gate reported" || fail "storefront_http: gate not reported"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "storefront_http: storefront rolled back" || fail "storefront_http: sf digest"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "storefront_http: backend rolled back" || fail "storefront_http: be digest"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "storefront_http: ACTIVE not written" || fail "storefront_http: ACTIVE written"

# same failure through the documented script-level fault switch
reset_harness
EV="$TMP/ev-sf-http-fault"
run_exec "$EV" "$TMP/out-sf-http-fault.txt" "WOODRIGHT_CUTOVER_FAULT=storefront_http"
[[ "$RC" -eq 10 ]] && pass "storefront_http fault: rollback_ok exit 10" || fail "storefront_http fault: rc=$RC"

# ==========================================================================
# 8) wrong digest after recreate -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-wrong-digest"
run_exec "$EV" "$TMP/out-wrong-digest.txt" "WOODRIGHT_FAKE_COMPOSE_WRONG_DIGEST=backend"
[[ "$RC" -eq 10 ]] && pass "wrong_digest: rollback_ok exit 10" || fail "wrong_digest: rc=$RC"
grep -q 'digest mismatch after recreate' "$TMP/out-wrong-digest.txt" && pass "wrong_digest: mismatch reported" || fail "wrong_digest: not reported"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "wrong_digest: backend rolled back" || fail "wrong_digest: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "wrong_digest: pins restored" || fail "wrong_digest: pins"

# ==========================================================================
# 9) missing media volume -> fail closed before any mutation
# ==========================================================================
reset_harness
rm -f "$STATE/volumes/${MEDIA_VOL}.ok"
EV="$TMP/ev-no-volume"
run_exec "$EV" "$TMP/out-no-volume.txt"
[[ "$RC" -eq 2 ]] && pass "missing_volume: fail closed exit 2" || fail "missing_volume: rc=$RC"
grep -q 'media volume missing' "$TMP/out-no-volume.txt" && pass "missing_volume: reported" || fail "missing_volume: not reported"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "missing_volume: pins untouched" || fail "missing_volume: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "missing_volume: nothing mutated" || fail "missing_volume: mutated"
[[ ! -d "$EV" ]] && pass "missing_volume: refused before taking the lock" || fail "missing_volume: evidence created"

# ==========================================================================
# 10) public bind detected
# ==========================================================================
reset_harness
write_container storefront "$OLD_SF_DIG" "0.0.0.0"
EV="$TMP/ev-public-bind"
run_exec "$EV" "$TMP/out-public-bind.txt"
[[ "$RC" -eq 2 ]] && pass "public_bind pre-lock: fail closed exit 2" || fail "public_bind pre-lock: rc=$RC"
grep -q 'PUBLIC_BIND' "$TMP/out-public-bind.txt" && pass "public_bind pre-lock: reported" || fail "public_bind pre-lock: not reported"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "public_bind pre-lock: nothing mutated" || fail "public_bind pre-lock: mutated"

reset_harness
EV="$TMP/ev-public-bind-post"
run_exec "$EV" "$TMP/out-public-bind-post.txt" "WOODRIGHT_FAKE_COMPOSE_PUBLIC_BIND=storefront"
[[ "$RC" -eq 10 ]] && pass "public_bind post-recreate: rollback_ok exit 10" || fail "public_bind post-recreate: rc=$RC"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "public_bind post-recreate: rolled back" || fail "public_bind post-recreate: sf digest"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "public_bind post-recreate: ACTIVE not written" || fail "public_bind post-recreate: ACTIVE written"

# ==========================================================================
# 11) public Traefik label detected
# ==========================================================================
reset_harness
write_container storefront "$OLD_SF_DIG" "127.0.0.1" 1
EV="$TMP/ev-public-traefik"
run_exec "$EV" "$TMP/out-public-traefik.txt"
[[ "$RC" -eq 2 ]] && pass "public_traefik pre-lock: fail closed exit 2" || fail "public_traefik pre-lock: rc=$RC"
grep -q 'PUBLIC_EXPOSURE' "$TMP/out-public-traefik.txt" && pass "public_traefik pre-lock: reported" || fail "public_traefik pre-lock: not reported"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "public_traefik pre-lock: nothing mutated" || fail "public_traefik pre-lock: mutated"

reset_harness
EV="$TMP/ev-public-traefik-post"
run_exec "$EV" "$TMP/out-public-traefik-post.txt" "WOODRIGHT_FAKE_COMPOSE_PUBLIC_TRAEFIK=storefront"
[[ "$RC" -eq 10 ]] && pass "public_traefik post-recreate: rollback_ok exit 10" || fail "public_traefik post-recreate: rc=$RC"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "public_traefik post-recreate: rolled back" || fail "public_traefik post-recreate: sf digest"

# ==========================================================================
# 12) scoped metadata write fails -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-metadata"
run_exec "$EV" "$TMP/out-metadata.txt" "WOODRIGHT_CUTOVER_FAULT=metadata_write"
[[ "$RC" -eq 10 ]] && pass "metadata_write: rollback_ok exit 10" || fail "metadata_write: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "metadata_write: backend rolled back" || fail "metadata_write: be digest"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "metadata_write: storefront rolled back" || fail "metadata_write: sf digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "metadata_write: pins restored" || fail "metadata_write: pins"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" && pass "metadata_write: previous ACTIVE_RELEASE intact" || fail "metadata_write: ACTIVE_RELEASE clobbered"

# ==========================================================================
# 12b) metadata_install fault after staging but before/during live install
#      - METADATA_WRITTEN is armed so rollback restores prior ownership
# ==========================================================================
reset_harness
EV="$TMP/ev-metadata-install"
run_exec "$EV" "$TMP/out-metadata-install.txt" "WOODRIGHT_CUTOVER_FAULT=metadata_install"
[[ "$RC" -eq 10 ]] && pass "metadata_install: rollback_ok exit 10" || fail "metadata_install: rc=$RC"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "metadata_install: pins restored" || fail "metadata_install: pins"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" && pass "metadata_install: previous ACTIVE_RELEASE intact" || fail "metadata_install: ACTIVE_RELEASE clobbered"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "metadata_install: containers rolled back" || fail "metadata_install: be digest"
lock_is_free "$LOCK" && pass "metadata_install: lock released" || fail "metadata_install: lock held"

# ==========================================================================
# 13) SIGTERM after the pin write -> rollback + lock released
# ==========================================================================
reset_harness
EV="$TMP/ev-sigterm-after"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_CUTOVER_TEST_PAUSE_AT=pins_written" "WOODRIGHT_CUTOVER_TEST_PAUSE_SEC=20")
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-sigterm-after.txt" 2>&1 &
SIG_PID=$!
for _ in $(seq 1 150); do
  [[ -f "$EV/state.txt" ]] && grep -q pins_written "$EV/state.txt" && break
  sleep 0.1
done
kill -TERM "$SIG_PID" 2>/dev/null || true
set +e
wait "$SIG_PID"
RC=$?
set -e
[[ "$RC" -eq 10 ]] && pass "sigterm_after_pins: rollback_ok exit 10" || fail "sigterm_after_pins: rc=$RC"
[[ "$(state_file "$EV")" == "rolled_back" ]] && pass "sigterm_after_pins: rolled_back" || fail "sigterm_after_pins: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "sigterm_after_pins: pins restored" || fail "sigterm_after_pins: pins"
lock_is_free "$LOCK" && pass "sigterm_after_pins: lock released" || fail "sigterm_after_pins: lock held"

# ==========================================================================
# 14) SIGTERM before the first write -> no rollback, lock released
# ==========================================================================
reset_harness
EV="$TMP/ev-sigterm-before"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_CUTOVER_TEST_PAUSE_AT=prepared" "WOODRIGHT_CUTOVER_TEST_PAUSE_SEC=20")
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-sigterm-before.txt" 2>&1 &
SIG_PID=$!
for _ in $(seq 1 150); do
  [[ -f "$EV/state.txt" ]] && grep -q prepared "$EV/state.txt" && break
  sleep 0.1
done
kill -TERM "$SIG_PID" 2>/dev/null || true
set +e
wait "$SIG_PID"
RC=$?
set -e
[[ "$RC" -eq 143 ]] && pass "sigterm_before_write: exits 143 without rollback" || fail "sigterm_before_write: rc=$RC"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "sigterm_before_write: failed_before_mutation" || fail "sigterm_before_write: state=$(state_file "$EV")"
[[ ! -f "$EV/json/rollback-result.json" ]] && pass "sigterm_before_write: no rollback performed" || fail "sigterm_before_write: rollback ran"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "sigterm_before_write: pins untouched" || fail "sigterm_before_write: pins"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "sigterm_before_write: nothing recreated" || fail "sigterm_before_write: mutated"
lock_is_free "$LOCK" && pass "sigterm_before_write: lock released" || fail "sigterm_before_write: lock held"

# ==========================================================================
# 15) concurrent same-environment execute is blocked by the lock
# ==========================================================================
reset_harness
HOLD_READY="$TMP/hold.ready"
rm -f "$HOLD_READY"
python3 - "$LOCK" "$HOLD_READY" <<'PY' &
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT)
fcntl.flock(fd, fcntl.LOCK_EX)
open(sys.argv[2], "w").write("1")
time.sleep(60)
PY
HOLD_PID=$!
for _ in $(seq 1 100); do [[ -s "$HOLD_READY" ]] && break; sleep 0.1; done
EV="$TMP/ev-concurrent"
run_exec "$EV" "$TMP/out-concurrent.txt" "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=2"
[[ "$RC" -eq 3 ]] && pass "concurrent: blocked with exit 3" || fail "concurrent: rc=$RC"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "concurrent: nothing mutated while blocked" || fail "concurrent: mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "concurrent: pins untouched" || fail "concurrent: pins changed"
kill "$HOLD_PID" 2>/dev/null || true
wait "$HOLD_PID" 2>/dev/null || true

# ==========================================================================
# 16) cross-environment isolation (already asserted per-case; explicit here)
# ==========================================================================
reset_harness
EV="$TMP/ev-crossenv"
run_exec "$EV" "$TMP/out-crossenv.txt"
[[ "$RC" -eq 0 ]] && pass "crossenv: execute succeeded" || fail "crossenv: rc=$RC"
assert_public_demo_untouched "crossenv"
if grep -rq 'public_demo\|public-demo' "$OWN_DIR" 2>/dev/null; then
  fail "crossenv: production metadata mentions public_demo"
else
  pass "crossenv: production metadata is production-scoped"
fi
grep -q '"environment": "production"' "$OWN_DIR/ACTIVE_OWNER.json" \
  && pass "crossenv: ACTIVE_OWNER is production-scoped" || fail "crossenv: ACTIVE_OWNER environment"

# ==========================================================================
# 17) dry-run performs zero writes
# ==========================================================================
reset_harness
# macOS ships shasum, Linux runners ship sha256sum - accept either.
if command -v shasum >/dev/null 2>&1; then
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec shasum -a 256 {} \; | sort; }
else
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec sha256sum {} \; | sort; }
fi
BEFORE_TREE="$(tree_hash)"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" >"$TMP/out-dryrun.txt" 2>"$TMP/err-dryrun.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "dry-run: exit 0" || { fail "dry-run: rc=$RC"; cat "$TMP/err-dryrun.txt"; }
AFTER_TREE="$(tree_hash)"
[[ "$BEFORE_TREE" == "$AFTER_TREE" ]] && pass "dry-run: zero writes under srv/ and etc/" || fail "dry-run: filesystem changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "dry-run: no docker mutation" || fail "dry-run: docker mutated"
python3 - "$TMP/out-dryrun.txt" "$APP_SHA" "$HELPER_SHA" <<'PY' && pass "dry-run: packet separates application and helper SHAs" || fail "dry-run: packet SHA fields"
import json, sys
raw = open(sys.argv[1]).read()
packet = json.loads(raw[raw.index("{"):])
assert packet["mode"] == "dry-run", packet["mode"]
assert packet["application_source_sha"] == sys.argv[2]
assert packet["helper_install_sha"] == sys.argv[3]
assert packet["application_source_sha"] != packet["helper_install_sha"]
plan = packet["planned_mutation"]
assert plan["recreate"]["order"] == ["backend", "storefront"], plan["recreate"]["order"]
assert plan["pin_plan"]["keys"]["WOODRIGHT_BACKEND_IMAGE"].endswith("a" * 64)
assert plan["rollback_refs"]["keeper_names"]["backend"].startswith("woodright-production-backend-keeper-")
assert "prepared" in plan["state_machine"]
assert packet["no_mutation_performed"] is True
PY

# ==========================================================================
# 18) wrong / missing execute confirmation
# ==========================================================================
reset_harness
for confirm_args in "--mode execute" "--mode execute --confirm-mutation WRONG_TOKEN"; do
  ENVS=()
  while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
  ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0" "WOODRIGHT_EVIDENCE_DIR=$TMP/ev-confirm")
  set +e
  # shellcheck disable=SC2086
  env "${ENVS[@]}" bash "$SCRIPT" \
    --environment production --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" $confirm_args \
    >"$TMP/out-confirm.txt" 2>&1
  RC=$?
  set -e
  [[ "$RC" -eq 2 ]] && pass "confirm gate: '$confirm_args' refused with exit 2" || fail "confirm gate: '$confirm_args' rc=$RC"
done
[[ ! -f "$STATE/log/mutations.log" ]] && pass "confirm gate: nothing mutated" || fail "confirm gate: mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "confirm gate: pins untouched" || fail "confirm gate: pins changed"

# ==========================================================================
# 19) helper install SHA is recorded next to - never instead of - the app SHA
# ==========================================================================
reset_harness
EV="$TMP/ev-sha-separation"
run_exec "$EV" "$TMP/out-sha-separation.txt"
[[ "$RC" -eq 0 ]] && pass "sha_separation: execute succeeded" || fail "sha_separation: rc=$RC"
python3 - "$OWN_DIR" "$APP_SHA" "$HELPER_SHA" <<'PY' && pass "sha_separation: ACTIVE/EXPECTED store the application SHA, helper SHA separately" || fail "sha_separation: metadata SHA fields"
import json, os, sys
own, app, helper = sys.argv[1:4]
assert app != helper
for name in ("ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"):
    doc = json.load(open(os.path.join(own, name)))
    assert doc["application_source_sha"] == app, (name, doc["application_source_sha"])
    assert doc["helper_install_sha"] == helper, (name, doc["helper_install_sha"])
    blob = json.dumps(doc)
    assert blob.count(helper) == 1, f"{name} repeats the helper SHA"
expected = json.load(open(os.path.join(own, "EXPECTED_RELEASE.json")))
assert expected["backend_digest"].startswith("sha256:")
PY
grep -q "$HELPER_SHA" "$EV/json/helper-install-sha.txt" && pass "sha_separation: evidence records the helper SHA" || fail "sha_separation: evidence helper sha"
grep -q "$APP_SHA" "$EV/json/application-source-sha.txt" && pass "sha_separation: evidence records the application SHA" || fail "sha_separation: evidence app sha"

# unresolved helper SHA must stay empty, never fall back to the application SHA
reset_harness
EV="$TMP/ev-no-helper-sha"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_HELPER_INSTALL_SHA=" "WOODRIGHT_HELPER_INSTALL_SHA_FILE=$TMP/absent-helper-sha.txt")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-no-helper-sha.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "no_helper_sha: execute succeeded" || fail "no_helper_sha: rc=$RC"
grep -q '"helper_install_sha": ""' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "no_helper_sha: empty helper SHA, not the application SHA" || fail "no_helper_sha: helper field"
grep -q '"application_source_sha": "'"$APP_SHA"'"' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "no_helper_sha: application SHA still recorded" || fail "no_helper_sha: app field"

# ==========================================================================
# 20) WOODRIGHT_COMPOSE_BIN override is honoured
# ==========================================================================
reset_harness
EV="$TMP/ev-compose-bin"
run_exec "$EV" "$TMP/out-compose-bin.txt" "WOODRIGHT_COMPOSE_BIN=$BIN/compose"
[[ "$RC" -eq 0 ]] && pass "compose_bin: execute succeeded through the override" || fail "compose_bin: rc=$RC"
grep -q 'compose_up storefront' "$STATE/log/journal.log" && pass "compose_bin: override journalled the recreate" || fail "compose_bin: no journal entry"

# ==========================================================================
# 21) refusals that must never reach the lock
# ==========================================================================
reset_harness
for bad in "--environment public_demo" "--environment staging"; do
  ENVS=()
  while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
  ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
  set +e
  # shellcheck disable=SC2086
  env "${ENVS[@]}" bash "$SCRIPT" $bad --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
    --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-badenv.txt" 2>&1
  RC=$?
  set -e
  [[ "$RC" -ne 0 ]] && pass "refusal: '$bad' rejected" || fail "refusal: '$bad' accepted"
done
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production --component pair \
  --source-sha "$APP_SHA" --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --dry-run --execute --confirm-mutation "$CONFIRM" >"$TMP/out-bothmodes.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: --dry-run with --execute rejected" || fail "refusal: both modes rc=$RC"

# execute must refuse a lock path outside /locks/production/
BADLOCK_CONF="$PROFILES/production.conf.badlock"
sed "s#WOODRIGHT_MUTATION_LOCK_PATH=.*#WOODRIGHT_MUTATION_LOCK_PATH=$SRV/locks/public_demo/live-cutover.lock#" \
  "$CONF" >"$BADLOCK_CONF"
mkdir -p "$TMP/profiles-badlock"
cp "$BADLOCK_CONF" "$TMP/profiles-badlock/production.conf"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_ENV_PROFILE_DIR=$TMP/profiles-badlock" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production --component pair \
  --source-sha "$APP_SHA" --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-badlock.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: non-production lock path rejected" || fail "refusal: bad lock rc=$RC"
grep -q 'locks/production/live-cutover.lock' "$TMP/out-badlock.txt" \
  && pass "refusal: names the only allowed lock" || fail "refusal: lock message"
lock_is_free "$PD_LOCK" && pass "refusal: public_demo lock never taken" || fail "refusal: public_demo lock held"

# ==========================================================================
# 22) static contract checks
# ==========================================================================
grep -q '^# LIVE_MUTATING=true' "$SCRIPT" && pass "static: header declares LIVE_MUTATING=true" || fail "static: LIVE_MUTATING header"
grep -q '^# requires_global_lock=true' "$SCRIPT" && pass "static: header declares requires_global_lock=true" || fail "static: requires_global_lock header"
grep -q '/srv/woodright/locks/production/live-cutover.lock' "$SCRIPT" && pass "static: names the canonical production lock" || fail "static: canonical lock path"
grep -q 'wr_staging_mutation_lock_acquire' "$SCRIPT" && pass "static: uses the shared flock helper" || fail "static: lock helper"
if grep -qE 'db:migrate|medusa exec|--seed|docker (system )?prune' "$SCRIPT"; then
  fail "static: script references migrations/seeds/prune"
else
  pass "static: no migration/seed/prune paths"
fi
if grep -qE 'recreate-staging-(backend|storefront)|reconcile-public-image-pins' "$SCRIPT"; then
  fail "static: reuses public_demo-only helpers"
else
  pass "static: does not call public_demo-only helpers"
fi
grep -q 'public_demo' "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "static: pin reconciler stays public_demo-only" || fail "static: pin reconciler scope"
if grep -qE '^\s*(production\|)?production\)' "$ROOT/scripts/release/reconcile-public-image-pins.sh"; then
  fail "static: pin reconciler now accepts production"
else
  pass "static: pin reconciler does not accept production"
fi
grep -q 'pair cutover only supports --environment public_demo' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  && pass "static: public_demo pair guard unmodified" || fail "static: public_demo pair guard"
node "$ROOT/scripts/release/check-global-lock-policy.cjs" ops/release >/dev/null 2>&1 \
  && pass "static: global lock policy passes for ops/release" || fail "static: global lock policy"

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK production-candidate cutover execute fidelity"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
