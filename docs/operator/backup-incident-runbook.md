# Backup / monitoring incident runbook (demo)

## Symptoms

| Signal | Likely cause | First action |
|--------|--------------|--------------|
| `backup_freshness` critical | missed timer / disk / lock | `systemctl status woodright-backup.service`; run manual backup |
| quarantine files grow | dump/tar failure | inspect `.../logs/`; fix root cause before retention |
| digest mismatch | external Dokploy deploy | reconcile identity; do **not** auto-rollback from monitor |
| media_mount fail | volume unbound | stop timers if needed; escalate; do not remount blindly |
| disk critical | retention lag / growth | dry-run retention; expand disk; **do not** delete last recovery point |

## Disable automation (safe)

```bash
sudo systemctl disable --now woodright-backup.timer woodright-monitor.timer
sudo systemctl stop woodright-backup.service woodright-monitor.service || true
# Retain /srv/woodright/backups/automated and monitoring state/logs
sudo systemctl daemon-reload
```

Does **not** change application containers.

## Installation rollback

1. Disable timers (above)  
2. Restore previous `/srv/woodright/ops` archive if present  
3. Remove unit symlinks under `/etc/systemd/system/` if needed  
4. `daemon-reload`  
5. Keep backups and logs  

## Buyer impact

Backup/monitor failures must **not** restart storefront/backend. If buyer regresses, treat as separate deploy incident (Dokploy), not backup tooling.

## Escalation

Document time (UTC), status JSON path, latest recovery-point name, disk %, and whether Nightly appeared. No secrets in tickets.
