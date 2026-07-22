# Woodright backup policy (demo staging)

**Scope:** `woodright-demo.ru` staging stack on Timeweb VM.  
**Not** a production SLA for `woodright.ru`.

## Objectives

| Metric | Demo target |
|--------|-------------|
| RPO | up to 24 hours |
| RTO | documented **manual** restore (no automatic production restore) |

## PostgreSQL

- Daily custom-format `pg_dump` (`-Fc`)
- Keep **14** daily recovery points
- Keep **4** weekly recovery points
- SHA-256 + `pg_restore --list` validation
- Never overwrite an existing file (timestamped names)
- Never dump role password hashes via `pg_dumpall`

## Media

- Daily full archive (tar.gz) while size allows (~0.5 GB today)
- Keep **14** daily + **4** weekly
- Mount guard: fail if volume missing / unexpectedly empty
- Never delete live media source
- SHA-256 + tar listing integrity

## Storage

| Destination | Path | Status |
|-------------|------|--------|
| VM local protected | `/srv/woodright/backups/automated/` | primary automation |
| Mac verified copy | `/Users/leonidmbp/Documents/projects/woodright-backups/p0-*` | manual P0; **not** deleted by retention |
| Second offsite | (none) | deferred until owner provides credentials |

Permissions: directories `0700`, files `0600`. Not published via Traefik. Not mounted into storefront.

## Schedule

- systemd timer `woodright-backup.timer`: daily **02:17 UTC** + up to 15m jitter (`Persistent=true`)

## Orchestration

`ops/backup/woodright-backup-run.sh`:

1. global lock  
2. disk check  
3. runtime identity read  
4. PostgreSQL readiness  
5. media mount guard  
6. PG backup  
7. media backup  
8. checksums  
9. combined recovery-point manifest  
10. retention **only after** full success  

## Forbidden

- Restore onto live DB/volume  
- Automatic container restart from backup tooling  
- Secrets in Git / unit bodies / world-readable args  
