# Public production monitor, backup, and recovery contracts

## Purpose

Repository-only contracts for the future `public_production` environment
(`https://woodright.ru`). This document does **not** authorize:

- VM install of systemd units
- live backup or restore
- application deploy
- DNS/TLS cutover
- OWNER PASS / launch_ready

## Environment isolation

| Path family | public_demo | production_candidate | public_production |
|---|---|---|---|
| Monitor state | `/srv/woodright/monitoring/state` | `.../production-candidate/state` | `.../public-production/state` |
| Backup root | `/srv/woodright/backups/automated` | `.../production-candidate` | `.../public-production` |
| Mutation lock | `locks/public_demo/...` | `locks/production/...` | `locks/public_production/...` |
| DB alias | `public_demo_db` | `non_public_candidate_db` | `public_production_db` |
| Media volume | staging stack volume | candidate volume | `woodright-public-production_woodright_public_media` |

Shared mutable latest-status / backup roots across environments are forbidden.
Validator: `ops/lib/woodright-ops-path-isolation.sh`.

## Monitor

Unit templates (disabled by default):

- `ops/systemd/woodright-monitor-public-production.service`
- `ops/systemd/woodright-monitor-public-production.timer`

Entrypoint:

```sh
/srv/woodright/ops/monitoring/woodright-health-check.sh --environment public_production
```

Fail-closed while `WOODRIGHT_ENVIRONMENT_PROVISIONED=0`:

- path isolation
- legal / payment / notification pending → critical
- alert destination missing → critical
- no live discovery against missing runtime (unless `WOODRIGHT_MONITOR_FORCE_LIVE=1`)

## Backup / recovery point

Helper:

```sh
ops/backup/woodright-public-production-backup-run.sh --environment public_production
```

Plan-only (repository / CI):

```sh
WOODRIGHT_BACKUP_PLAN_ONLY=1 \
  ops/backup/woodright-public-production-backup-run.sh --environment public_production
```

Live backup refuses:

- wrong environment
- staging/candidate DB names or media volumes
- unprovisioned environment
- authority mismatch
- symlink backup targets / lock contention
- partial DB-only or media-only recovery points

Combined manifest schema: `woodright_recovery_point_v2`
(`ops/lib/woodright-recovery-point.sh`).

Units (disabled by default):

- `woodright-backup-public-production.service`
- `woodright-backup-public-production.timer` (03:17 UTC, offset from demo)

## Restore rehearsal

Helper:

```sh
ops/backup/woodright-public-production-restore-rehearsal.sh \
  --environment public_production \
  --manifest /path/to/recovery-point.json
```

Behaviour:

1. validate manifest + checksums
2. disposable PostgreSQL container
3. restore dump
4. UTF8 / aggregate **counts only** (no PII rows)
5. media archive integrity
6. report under `WOODRIGHT_RESTORE_REPORT_DIR`
7. cleanup only disposable resources from this cycle

Unit exists **without** a timer - owner-authorized oneshot only.

## Alert contract

Interface only (`ops/lib/woodright-alert-contract.sh`). No webhook/SMTP credentials
in Git. Public-production launch readiness stays blocked until an on-VM
destination file validates at `WOODRIGHT_ALERT_DESTINATION_PATH`.

## Profile validator

```sh
node scripts/release/validate-public-production-profile.cjs
# STATUS PUBLIC_PRODUCTION_PROFILE_VALID_CONTRACTS_READY_OWNER_DECISIONS_PENDING
```

`launch_ready` remains `false`. Runtime gates stay pending until VM provision,
fresh restore rehearsal, legal/payment/SMTP owner decisions, DNS/TLS proof, and
qualified application images.

## Fidelity

```sh
bash scripts/ops/test-public-production-monitor-backup-fidelity.sh
```

## Legal deferral

Legal Draft PR `#162` stays independent. Missing legal entity / INN / OGRN keep
`LEGAL_CONTENT_STATUS` non-approved. Monitor/backup contracts do not bypass that gate.
