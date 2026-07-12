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
if [[ -f "$SCRIPT_DIR/run-backend.sh" ]]; then
  atomic_install "$SCRIPT_DIR/run-backend.sh" "$QA_DIR/run-backend.sh"
  chmod +x "$QA_DIR/run-backend.sh"
fi
if [[ -f "$SCRIPT_DIR/run-storefront.sh" ]]; then
  atomic_install "$SCRIPT_DIR/run-storefront.sh" "$QA_DIR/run-storefront.sh"
  chmod +x "$QA_DIR/run-storefront.sh"
fi
if [[ -f "$SCRIPT_DIR/com.woodright.medusa-backend.plist" ]]; then
  atomic_install "$SCRIPT_DIR/com.woodright.medusa-backend.plist" "$QA_DIR/com.woodright.medusa-backend.plist"
fi
if [[ -f "$SCRIPT_DIR/com.woodright.storefront-qa.plist" ]]; then
  atomic_install "$SCRIPT_DIR/com.woodright.storefront-qa.plist" "$QA_DIR/com.woodright.storefront-qa.plist"
fi

tmp_start="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
cat > "$tmp_start" <<'EOF'
#!/bin/bash
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
echo "Woodright Medusa (default develop; qa only if build exists) -> http://127.0.0.1:9000/health"
# Default develop: catalog/Admin stay up without medusa build.
# Force qa: WOODRIGHT_BACKEND_MODE=qa ./woodright-backend.sh start qa (needs yarn medusa build)
exec /bin/bash ./woodright-backend.sh start develop
EOF
chmod +x "$tmp_start"
mv -f "$tmp_start" "$QA_DIR/start-backend.command"

# Prefer repo run-backend.sh (already installed above). Keep inline fallback only if missing.
if [[ ! -f "$QA_DIR/run-backend.sh" ]]; then
  tmp_run="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
  cat > "$tmp_run" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${WOODRIGHT_BACKEND_MODE:-develop}"
PAUSE_FILE="$DIR/backend-9000.pause"
[[ -f "$PAUSE_FILE" ]] && exit 0
export WOODRIGHT_START_FOREGROUND=1
exec /bin/bash "$DIR/woodright-backend.sh" start "$MODE"
EOF
  chmod +x "$tmp_run"
  mv -f "$tmp_run" "$QA_DIR/run-backend.sh"
fi

tmp_stop="$(mktemp "$QA_DIR/.tmp.XXXXXX")"
cat > "$tmp_stop" <<'EOF'
#!/bin/bash
export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
# Pause launchd supervisor (SuccessfulExit) + stop listeners
touch ./backend-9000.pause
/bin/bash ./woodright-backend.sh stop || true
uid="$(id -u)"
launchctl bootout "gui/${uid}/com.woodright.medusa-backend" 2>/dev/null || true
echo "stopped :9000 (pause file set; LaunchAgent booted out if present)"
echo "to resume: rm backend-9000.pause && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.woodright.medusa-backend.plist"
EOF
chmod +x "$tmp_stop"
mv -f "$tmp_stop" "$QA_DIR/stop-backend.command"

{
  echo "installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_dir=$SCRIPT_DIR"
  shasum -a 256 "$QA_DIR/woodright-backend.sh" | awk '{print "backend_sha256="$1}'
  shasum -a 256 "$QA_DIR/woodright-doctor.sh" 2>/dev/null | awk '{print "doctor_sha256="$1}' || true
  shasum -a 256 "$QA_DIR/run-storefront.sh" 2>/dev/null | awk '{print "storefront_runner_sha256="$1}' || true
} >"$VERSION_FILE"

echo "installed wrappers in $QA_DIR"
echo "version: $VERSION_FILE"
echo "plist copies (optional install to ~/Library/LaunchAgents):"
echo "  $QA_DIR/com.woodright.medusa-backend.plist"
echo "  $QA_DIR/com.woodright.storefront-qa.plist"
echo "try: $QA_DIR/woodright-backend.sh status"
