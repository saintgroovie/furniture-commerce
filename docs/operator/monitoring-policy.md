# Woodright monitoring policy (demo)

## Mode

**Read-only.** Monitoring observes; it does **not** remediate.

### Forbidden commands (hard ban)

`docker restart|kill|rm`, `docker compose up|down`, `systemctl restart` of runtime services, `iptables`/`ip6tables` mutate, `ufw allow|delete`, Dokploy deploy, Git mutation, backup deletion, media remount, `kill`.

## Schedule

- `woodright-monitor.timer`: ~every **15 minutes** (`OnUnitActiveSec=15min`)

## Outputs

| Path | Purpose |
|------|---------|
| `/srv/woodright/monitoring/state/last-status.json` | latest |
| `/srv/woodright/monitoring/state/last-success.json` | last exit 0 |
| `/srv/woodright/monitoring/state/last-failure.json` | last non-zero |
| `/srv/woodright/monitoring/history/status-*.json` | bounded history |

Exit codes: `0` ok, `1` warning, `2` critical.

## Checks (summary)

Buyer HTTPS routes, SEO noindex headers, CSP/HSTS, API denial without key, container health, media mount, digest vs `ACTIVE_OWNER.json` / `EXPECTED_RELEASE.json`, Nightly absent, raw ports posture, TLS expiry, disk/inodes, backup freshness, Postgres readiness aggregates, Redis ping.

## Expected digests

Monitoring **reads** `/srv/woodright/runtime-ownership/ACTIVE_OWNER.json` (or `EXPECTED_RELEASE.json`).  
It **never** auto-updates expected digests. Updates are release-process / owner-approved only.

## Alerting

If no email/Slack/Telegram/webhook credentials exist:

`external_alert_destination_deferred`

Operators poll JSON / journald manually. This does not block monitoring install.
