# Woodright backup restore runbook (demo)

## Principles

1. **Isolated first.** Rehearse on temporary containers/volumes.  
2. **Never** restore onto live `woodright_staging` or live media volume without explicit owner approval.  
3. No PII in logs: aggregate counts only.

## Locate recovery point

```bash
ls -lt /srv/woodright/backups/automated/manifests/recovery-point-*.json | head
cat /srv/woodright/backups/automated/manifests/recovery-point-<TS>.json
sha256sum -c <dump>.sha256
```

## Isolated PostgreSQL restore (rehearsal)

```bash
# Match major version (15.x)
docker network create wr-restore-net
docker volume create wr-restore-pg-data
docker run -d --name wr-restore-pg --network wr-restore-net \
  -e POSTGRES_PASSWORD=restore_only_local \
  -e POSTGRES_USER=woodright \
  -e POSTGRES_DB=woodright_restore \
  -v wr-restore-pg-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Wait ready, then:
docker cp /srv/woodright/backups/automated/postgres/daily/<file>.dump wr-restore-pg:/tmp/r.dump
docker exec wr-restore-pg pg_restore -U woodright -d woodright_restore --no-owner --no-acl /tmp/r.dump

# Aggregate counts only (example):
docker exec wr-restore-pg psql -U woodright -d woodright_restore -tAc \
  "SELECT 'products', count(*) FROM product UNION ALL SELECT 'orders', count(*) FROM \"order\";"

# Cleanup
docker rm -f wr-restore-pg
docker volume rm wr-restore-pg-data
docker network rm wr-restore-net
```

Do **not** publish restore Postgres on a host port.

## Isolated media restore (rehearsal)

```bash
TMP=$(mktemp -d /var/tmp/wr-media-restore.XXXXXX)
chmod 0700 "$TMP"
tar -tzf /srv/woodright/backups/automated/media/daily/<file>.tar.gz | wc -l
tar -xzf /srv/woodright/backups/automated/media/daily/<file>.tar.gz -C "$TMP"
# verify counts / magic bytes; then:
rm -rf "$TMP"
```

Never extract onto `/server/static` live mount.

## Production restore (requires owner approval)

Documented separately per incident. Requires:

- written owner approval  
- maintenance window  
- Dokploy coordination  
- dual SSH sessions  
- rollback keepers verified  

## Manual backup run

```bash
sudo /srv/woodright/ops/backup/woodright-backup-run.sh
```

## Retention dry-run

```bash
sudo WOODRIGHT_BACKUP_ROOT=/srv/woodright/backups/automated \
  /srv/woodright/ops/backup/woodright-backup-retention.sh --dry-run
```
