#!/usr/bin/env bash
# Install/update Finder wrappers under ~/.woodright/qa-dev-servers
# to call the repo's woodright-backend.sh (single-instance Medusa on :9000).
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/woodright-backend.sh"
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
VERSION_FILE="$QA_DIR/woodright-local-dev.version"

[[ -f "$SRC" ]] || { echo "error: missing $SRC" >&2; exit 1; }
mkdir -p "$QA_DIR"

atomic_install() {
  local src="$1" dest="$2"
  local tmp
  tmp="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
  cp "$src" "$tmp"
  if [[ -x "$src" ]] || [[ "$dest" == *.sh ]] || [[ "$dest" == *.command ]]; then
    chmod +x "$tmp"
  fi
  mv -f "$tmp" "$dest"
}

atomic_install "$SRC" "$QA_DIR/woodright-backend.sh"
chmod +x "$QA_DIR/woodright-backend.sh"

if [[ -f "$SCRIPT_DIR/patch-medusa-develop-watch.mjs" ]]; then
  atomic_install "$SCRIPT_DIR/patch-medusa-develop-watch.mjs" "$QA_DIR/patch-medusa-develop-watch.mjs"
fi
if [[ -f "$SCRIPT_DIR/woodright-doctor.sh" ]]; then
  atomic_install "$SCRIPT_DIR/woodright-doctor.sh" "$QA_DIR/woodright-doctor.sh"
  chmod +x "$QA_DIR/woodright-doctor.sh"
fi
if [[ -f "$SCRIPT_DIR/woodright-storefront.sh" ]]; then
  atomic_install "$SCRIPT_DIR/woodright-storefront.sh" "$QA_DIR/woodright-storefront.sh"
  chmod +x "$QA_DIR/woodright-storefront.sh"
fi
if [[ -f "$SCRIPT_DIR/woodright-backend-scenarios.sh" ]]; then
  atomic_install "$SCRIPT_DIR/woodright-backend-scenarios.sh" "$QA_DIR/woodright-backend-scenarios.sh"
  chmod +x "$QA_DIR/woodright-backend-scenarios.sh"
fi

tmp_start="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
cat > "$tmp_start" <<'EOF'
#!/bin/bash
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
echo "Woodright Medusa QA (medusa start) -> http://127.0.0.1:9000/health"
# Prefer qa (no watcher). For backend code reload use: ./woodright-backend.sh start develop
exec /bin/bash ./woodright-backend.sh start qa
EOF
chmod +x "$tmp_start"
mv -f "$tmp_start" "$QA_DIR/start-backend.command"

tmp_stop="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
cat > "$tmp_stop" <<'EOF'
#!/bin/bash
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
exec /bin/bash ./woodright-backend.sh stop
EOF
chmod +x "$tmp_stop"
mv -f "$tmp_stop" "$QA_DIR/stop-backend.command"

tmp_run="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
cat > "$tmp_run" <<'EOF'
#!/usr/bin/env bash
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
# Default QA profile: medusa start (requires prior build). Override: WOODRIGHT_BACKEND_MODE=develop
MODE="${WOODRIGHT_BACKEND_MODE:-qa}"
exec /bin/bash "$(cd "$(dirname "$0")" && pwd)/woodright-backend.sh" start "$MODE"
EOF
chmod +x "$tmp_run"
mv -f "$tmp_run" "$QA_DIR/run-backend.sh"

{
  echo "installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_dir=$SCRIPT_DIR"
  shasum -a 256 "$QA_DIR/woodright-backend.sh" | awk '{print "backend_sha256="$1}'
  shasum -a 256 "$QA_DIR/woodright-doctor.sh" 2>/dev/null | awk '{print "doctor_sha256="$1}' || true
} >"$VERSION_FILE"

echo "installed wrappers in $QA_DIR"
echo "version: $VERSION_FILE"
echo "try: $QA_DIR/woodright-backend.sh status"
