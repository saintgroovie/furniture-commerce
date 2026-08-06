#!/usr/bin/env bash
# Install canonical wr-p0 docker-user blocks onto this host (requires root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
install -m 0755 "$ROOT/ops/security/wr-p0-docker-user-blocks.sh" /usr/local/sbin/wr-p0-docker-user-blocks.sh
install -m 0644 "$ROOT/ops/systemd/wr-p0-docker-user-blocks.service" /etc/systemd/system/wr-p0-docker-user-blocks.service
# Operator doc (best-effort)
if [[ -f "$ROOT/docs/operator/dokploy-ssh-tunnel-access.md" ]]; then
  mkdir -p /srv/woodright/docs/operator
  install -m 0644 "$ROOT/docs/operator/dokploy-ssh-tunnel-access.md" /srv/woodright/docs/operator/dokploy-ssh-tunnel-access.md
fi
systemctl daemon-reload
systemctl enable wr-p0-docker-user-blocks.service
# RemainAfterExit oneshot: restart re-runs ExecStart for updated helper rules.
systemctl restart wr-p0-docker-user-blocks.service
