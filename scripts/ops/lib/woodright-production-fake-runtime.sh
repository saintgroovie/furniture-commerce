#!/usr/bin/env bash
# Shared fake docker / docker compose / HTTP shims for the PRIVATE
# production-candidate fidelity harnesses.
#
# Sourced by:
#   scripts/ops/test-production-candidate-cutover-execute-fidelity.sh
#   scripts/ops/test-production-candidate-skew-recovery-fidelity.sh
#
# One implementation, so a behaviour the cutover harness proves (deferred health
# flips, digest-scoped defects, force-recreate accounting) means the same thing
# in the recovery harness. Nothing here touches a real docker, container, pin
# file or lock: every shim reads and writes only $WOODRIGHT_FAKE_DOCKER_STATE.
#
# Usage: wr_fake_runtime_install <bin-dir>   (writes docker, compose, http)
#
# Heredoc bodies stay unindented on purpose - their terminators must sit at
# column 0.

wr_fake_runtime_install() {
  local BIN="${1:?bin dir required}"
  mkdir -p "$BIN"

cat >"$BIN/docker" <<'DOCKER_EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
mkdir -p "$STATE/containers" "$STATE/images" "$STATE/volumes" "$STATE/log" \
  "$STATE/health-ready-at" "$STATE/deployed"
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
  # Allow inspect by container Id (docker ps -aq returns Ids, not names).
  if [[ ! -f "$f" ]]; then
    f="$(python3 - "$STATE" "$target" <<'PY'
import json, os, sys
state, want = sys.argv[1:3]
want = want.lstrip("/")
root = os.path.join(state, "containers")
if not os.path.isdir(root):
    sys.exit(0)
for name in os.listdir(root):
    if not name.endswith(".json"):
        continue
    path = os.path.join(root, name)
    try:
        d = json.load(open(path))
    except Exception:
        continue
    obj = d[0] if isinstance(d, list) else d
    cid = str(obj.get("Id", "")).lstrip("/")
    cname = str(obj.get("Name", "")).lstrip("/")
    if want in (cid, cname) or cid.startswith(want) or want.startswith(cid):
        print(path)
        break
PY
)"
  fi
  # Deferred health flip: a container may be created "starting" with a
  # ready-at epoch. Once that epoch passes, the very next inspect observes
  # "healthy" - exactly how a real --start-period behaves.
  if [[ -f "$f" && -f "$STATE/health-ready-at/${target#/}" ]]; then
    ready_at="$(cat "$STATE/health-ready-at/${target#/}")"
    if [[ "$(date +%s)" -ge "$ready_at" ]]; then
      rm -f "${f%.json}.props" "$STATE/health-ready-at/${target#/}"
      python3 - "$f" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
obj = d[0] if isinstance(d, list) else d
obj.setdefault("State", {}).setdefault("Health", {})["Status"] = "healthy"
json.dump(d, open(sys.argv[1], "w"))
PY
    fi
  fi
  # Also flip health when inspecting by Id that resolved to a named file.
  if [[ -f "$f" ]]; then
    base="$(basename "$f" .json)"
    if [[ -f "$STATE/health-ready-at/${base}" ]]; then
      ready_at="$(cat "$STATE/health-ready-at/${base}")"
      if [[ "$(date +%s)" -ge "$ready_at" ]]; then
        rm -f "${f%.json}.props" "$STATE/health-ready-at/${base}"
        python3 - "$f" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
obj = d[0] if isinstance(d, list) else d
obj.setdefault("State", {}).setdefault("Health", {})["Status"] = "healthy"
json.dump(d, open(sys.argv[1], "w"))
PY
      fi
    fi
  fi
  [[ -f "$f" ]] || f="$STATE/images/$(image_key "$target").json"
  [[ -f "$f" ]] || exit 1
  if [[ -n "$fmt" ]]; then render "$f" "$fmt"; else cat "$f"; fi
  ;;
  ps)
    # Minimal label-filter support for compose keeper ownership checks:
    #   docker ps -aq --filter label=com.docker.compose.project=X \
    #                 --filter label=com.docker.compose.service=Y
    quiet=0
    declare -a label_filters=()
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -q|-aq|-qa) quiet=1; shift ;;
        -a|--all) shift ;;
        --filter|-f)
          case "$2" in
            label=*) label_filters+=("${2#label=}") ;;
          esac
          shift 2
          ;;
        --filter=*)
          case "${1#--filter=}" in
            label=*) label_filters+=("${1#--filter=label=}") ;;
          esac
          shift
          ;;
        *) shift ;;
      esac
    done
    python3 - "$STATE" "${label_filters[@]}" <<'PY'
import json, os, sys
state = sys.argv[1]
filters = sys.argv[2:]
root = os.path.join(state, "containers")
if not os.path.isdir(root):
    sys.exit(0)
for name in sorted(os.listdir(root)):
    if not name.endswith(".json"):
        continue
    path = os.path.join(root, name)
    try:
        d = json.load(open(path))
    except Exception:
        continue
    obj = d[0] if isinstance(d, list) else d
    labels = (obj.get("Config") or {}).get("Labels") or {}
    ok = True
    for flt in filters:
        if "=" not in flt:
            ok = False
            break
        k, v = flt.split("=", 1)
        if labels.get(k) != v:
            ok = False
            break
    if not ok:
        continue
    print(obj.get("Id") or name[:-5])
PY
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
mkdir -p "$STATE/log" "$STATE/containers" "$STATE/health-ready-at" "$STATE/deployed"
printf 'compose %s\n' "$*" >>"$STATE/log/commands.log"

env_file=""; project=""; compose_file=""; service=""; up=0; force=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file) compose_file="$2"; shift 2 ;;
    --env-file) env_file="$2"; shift 2 ;;
    --project-name|-p) project="$2"; shift 2 ;;
    up) up=1; shift ;;
    --force-recreate) force=1; shift ;;
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
printf 'compose_up %s project=%s force=%s\n' "$service" "$project" "$force" >>"$STATE/log/mutations.log"
printf 'compose_up %s\n' "$service" >>"$STATE/log/journal.log"
if [[ "${WOODRIGHT_FAKE_COMPOSE_FAIL:-}" == "$service" ]]; then
  echo "harness: compose up $service failed" >&2
  exit 1
fi

python3 - "$STATE" "$env_file" "$service" <<'PY'
import json, os, sys, time
state, env_file, service = sys.argv[1:4]
pins = {}
for line in open(env_file, encoding="utf-8"):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.rstrip("\n").split("=", 1)
        pins[k] = v
key = "WOODRIGHT_BACKEND_IMAGE" if service == "backend" else "WOODRIGHT_STOREFRONT_IMAGE"
image = pins.get(key, "")
digest = image.split("@")[-1]

# Defect flags only apply to the digests declared broken. Anything else (in
# practice: the pre-cutover image a rollback puts back) comes up clean, which
# is what makes rollback postconditions meaningful in this harness.
defect_digests = [
    d.strip()
    for d in os.environ.get("WOODRIGHT_FAKE_COMPOSE_DEFECT_DIGESTS", "").split(",")
    if d.strip()
]
defective = (not defect_digests) or (digest in defect_digests)


def defect(var):
    return defective and os.environ.get(var) == service


if defect("WOODRIGHT_FAKE_COMPOSE_WRONG_DIGEST"):
    digest = "sha256:" + ("9" * 64)
    image = image.split("@")[0] + "@" + digest
name = os.environ.get("WOODRIGHT_FAKE_CONTAINER_PREFIX", "woodright-production") + f"-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
host_ip = "0.0.0.0" if defect("WOODRIGHT_FAKE_COMPOSE_PUBLIC_BIND") else "127.0.0.1"
be_port = os.environ.get("WOODRIGHT_FAKE_BE_HOST_PORT", "9200")
sf_port = os.environ.get("WOODRIGHT_FAKE_SF_HOST_PORT", "3200")
host_port = be_port if service == "backend" else sf_port
container_port = "9000/tcp" if service == "backend" else "3000/tcp"
health = "unhealthy" if defect("WOODRIGHT_FAKE_COMPOSE_UNHEALTHY") else "healthy"

# Slow start: come up "starting" and flip to healthy after N seconds, the way a
# real HEALTHCHECK --start-period behaves.
starting_sec = 0
if defect("WOODRIGHT_FAKE_COMPOSE_STARTING"):
    starting_sec = int(os.environ.get("WOODRIGHT_FAKE_COMPOSE_STARTING_SEC", "1"))
    health = "starting"
ready_marker = os.path.join(state, "health-ready-at", name)
if starting_sec > 0:
    os.makedirs(os.path.dirname(ready_marker), exist_ok=True)
    open(ready_marker, "w").write(str(int(time.time()) + starting_sec))
elif os.path.exists(ready_marker):
    os.remove(ready_marker)

labels = {
    "com.woodright.deployment-owner": "Dokploy",
    "com.woodright.runtime-role": os.environ.get("WOODRIGHT_FAKE_RUNTIME_ROLE", "production_candidate"),
    "com.woodright.exposure": os.environ.get("WOODRIGHT_FAKE_EXPOSURE", "private"),
    "com.woodright.database-identity": os.environ.get("WOODRIGHT_FAKE_DB_ALIAS", "non_public_candidate_db"),
    "org.opencontainers.image.title": title,
    "com.docker.compose.project": os.environ.get("WOODRIGHT_FAKE_COMPOSE_PROJECT", "woodright-production"),
    "com.docker.compose.service": service,
    "com.docker.compose.container-number": "1",
    "com.woodright.release-sha": os.environ.get("WOODRIGHT_FAKE_RELEASE_SHA", ""),
}
if defect("WOODRIGHT_FAKE_COMPOSE_PUBLIC_TRAEFIK"):
    labels["traefik.enable"] = "true"
    labels["traefik.http.routers.wr.rule"] = "Host(`woodright.ru`)"
doc = [{
    "Id": f"id-{service}-new-{int(time.time()*1000)}",
    "Name": f"/{name}",
    "Image": digest,
    "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{digest}"],
    "RestartCount": 0,
    "Config": {
        "Image": image,
        "Env": [
            f"WOODRIGHT_EXPOSURE={os.environ.get('WOODRIGHT_FAKE_EXPOSURE', 'private')}",
            f"WOODRIGHT_DATABASE_IDENTITY_ALIAS={os.environ.get('WOODRIGHT_FAKE_DB_ALIAS', 'non_public_candidate_db')}",
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
        [{"Type": "volume", "Name": os.environ.get("WOODRIGHT_FAKE_MEDIA_VOLUME", "woodright-production_woodright-production_media"),
          "Destination": "/server/static"}] if service == "backend" else []
    ),
    "State": {
        "Status": "running",
        "StartedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000000000Z", time.gmtime()),
        "Health": {"Status": health},
    },
    "NetworkSettings": {"Networks": {"dokploy-network": {}}, "Ports": {}},
}]
json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
# The fake HTTP probe reads this to decide whether the port is being served by
# a known-broken image.
os.makedirs(os.path.join(state, "deployed"), exist_ok=True)
open(os.path.join(state, "deployed", service), "w").write(digest)
PY
COMPOSE_EOF
chmod +x "$BIN/compose"

# --------------------------------------------------------------------------
# fake http probe
# --------------------------------------------------------------------------
cat >"$BIN/http" <<'HTTP_EOF'
#!/usr/bin/env bash
# Fake loopback probe.
#   WOODRIGHT_FAKE_HTTP_FAIL=<port>   503 while that port is served by a digest
#                                     listed in WOODRIGHT_FAKE_COMPOSE_DEFECT_DIGESTS
#                                     (i.e. the broken candidate). After a
#                                     rollback puts the previous image back, the
#                                     same port answers 200.
#   WOODRIGHT_FAKE_HTTP_FLAKY_PORT +
#   WOODRIGHT_FAKE_HTTP_FLAKY_TIMES   first N probes of that port answer 503,
#                                     then 200 (transient warm-up).
set -uo pipefail
url="${1:-}"
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:-}"

port_service() {
  case "$1" in
    9200|9300) echo backend ;;
    3200|3300) echo storefront ;;
    *) echo "" ;;
  esac
}

if [[ -n "${WOODRIGHT_FAKE_HTTP_FLAKY_PORT:-}" && "$url" == *":${WOODRIGHT_FAKE_HTTP_FLAKY_PORT}"* ]]; then
  counter="${STATE}/http-flaky-${WOODRIGHT_FAKE_HTTP_FLAKY_PORT}"
  seen=0
  [[ -f "$counter" ]] && seen="$(cat "$counter")"
  seen=$((seen + 1))
  printf '%s' "$seen" >"$counter"
  if [[ "$seen" -le "${WOODRIGHT_FAKE_HTTP_FLAKY_TIMES:-1}" ]]; then
    echo 503
    exit 0
  fi
fi

if [[ -n "${WOODRIGHT_FAKE_HTTP_FAIL:-}" && "$url" == *"${WOODRIGHT_FAKE_HTTP_FAIL}"* ]]; then
  svc="$(port_service "${WOODRIGHT_FAKE_HTTP_FAIL}")"
  deployed=""
  [[ -n "$svc" && -f "${STATE}/deployed/${svc}" ]] && deployed="$(cat "${STATE}/deployed/${svc}")"
  defects="${WOODRIGHT_FAKE_COMPOSE_DEFECT_DIGESTS:-}"
  if [[ -z "$deployed" || -z "$defects" || ",${defects}," == *",${deployed},"* ]]; then
    echo 503
    exit 0
  fi
fi
echo 200
HTTP_EOF
chmod +x "$BIN/http"
}
