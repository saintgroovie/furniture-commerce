# Production-candidate rollback (private stack)

Audience: operators restoring the **private** Woodright production-candidate
(`woodright-production`, binds `127.0.0.1:9200` / `127.0.0.1:3200`).

This is **not** public-demo rollback and **not** a `woodright.ru` DNS procedure.

## Scope: image rollback is automatic, DB rollback is this document

`ops/release/cutover-production-candidate.sh --mode execute` performs the image
pair cutover itself and **rolls itself back** on any failure after the first pin
write - including on `SIGINT` / `SIGTERM` / `SIGHUP`. `ACTIVE_OWNER` /
`EXPECTED_RELEASE` / `ACTIVE_RELEASE` are written **only** after readiness and
the loopback HTTP gates pass, so a rolled-back attempt never publishes a
release.

### No keeper containers (2026-08-02 change)

Rollback no longer renames the live container aside. A renamed container keeps
its `com.docker.compose.*` labels, so the next `compose up` for the same
project/service recreates or removes it - the keeper evaporated exactly when
rollback needed it, and `restore_component_from_keeper` returned success for a
keeper that no longer existed. That produced a **false `ROLLBACK_OK`**: pins
restored, candidates still live.

The rollback anchor is now:

1. the backed-up compose `.env` (`<evidence>/pin-backup/dokploy-compose.env`), and
2. `PRE_BE_REF` / `PRE_SF_REF` - the exact immutable `...@sha256:<64hex>` refs
   the containers ran on before the first write, proven present in the local
   image store **before** anything is mutated
   (`<evidence>/json/rollback-anchors.json`).

Rollback restores the pins, recreates backend then storefront on those refs
(`compose up -d --no-deps --force-recreate`), waits for readiness, and then
**verifies postconditions**:

- runtime `RepoDigest` refs are byte-equal to the restored pins
- private loopback binds, media volume mounted, no public Traefik
- minimal loopback HTTP gates

Only when **all** of them hold does the run report `rolled_back` / exit `10`.
Otherwise it reports `rollback_incomplete` / exit **13** (or `12` when the pins
themselves could not be restored) and logs the exact mismatch. Treat `13` as an
open incident: the pins and the runtime disagree.

### Readiness, not a one-shot health read

Docker health `starting` is the normal state of a freshly recreated container
(backend `HEALTHCHECK --start-period=60s`, storefront `--start-period=40s`).
The helper polls to a deadline instead of reading health once:

- terminal immediately: absent, `exited`, `dead`, `removing`, restart loop
- transient: `created`, `starting`, `unhealthy` before the deadline
- deadline: derived from the image healthcheck when readable, else backend
  `180s` / storefront `150s`; poll interval `2s`
- per-attempt evidence: `<evidence>/raw/health-poll-<component>.txt`

### Exit codes

| code | meaning |
|---|---|
| `0` | committed |
| `2` | usage / validation (nothing mutated) |
| `3` | lock contention |
| `4` | dry-run candidate mismatch |
| `10` | `rolled_back`, postconditions verified |
| `11` | reserved, not emitted |
| `12` | `rollback_failed` - pins could not be restored |
| `13` | `rollback_incomplete` - pins restored, postconditions not proven |

### Pre-existing pin/runtime skew is refused

If the compose `.env` pins already disagree with the live container digests,
`--mode execute` **dies before the lock and before any write** with
`existing_pin_runtime_skew_requires_recovery`, and the dry-run packet reports
`existing_pin_runtime_skew: true` / `normal_execute_blocked: true`. A pin file
that does not describe the runtime cannot serve as a rollback anchor.

Fix it first with `ops/release/recover-production-candidate-skew.sh` - see
[Skew recovery](#skew-recovery-pins-vs-runtime) below.

Consequences for the manual procedure further down:

- The helper takes the production-scoped lock
  `/srv/woodright/locks/production/live-cutover.lock` (from
  `ops/config/runtime-environments/production.conf`), not the generic one named
  in Phase A. Do not run both at once. The recovery helper takes the **same**
  lock, so the two can never interleave.
- Do **not** look for `*-keeper-*` containers for production. They are no longer
  created, and any that exist are stale artefacts of an older helper.
- The evidence directory of the failed run
  (`.../private-pair-cutover-<UTC>/`) holds `state.txt`,
  `state-transitions.log`, `json/rollback-anchors.json`,
  `json/rollback-result.json`, `raw/health-poll-*.txt`, the pin backup and the
  pre/post inspect snapshots. Read it before starting any manual step.
- The application release SHA (`application_source_sha`, the OCI revision of
  the images) and the helper install SHA (`helper_install_sha`, the ops commit
  that installed the script) are recorded as separate fields. When restoring,
  anchor on the application SHA - never on the helper SHA.

Use the phases below when the image-level rollback is not enough: database
damage, a partially applied migration, or a failure discovered after the
cutover already committed.

## Skew recovery (pins vs runtime)

`ops/release/recover-production-candidate-skew.sh` is the only supported way to
converge a stack whose compose `.env` pins and running containers disagree. It
takes the same production lock, defaults to dry-run, and requires
`--confirm-mutation I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY` to
mutate. All four refs are mandatory and must be immutable digest refs.

**`--recovery-mode adopt-live-candidates` (preferred)** - the live containers
are the intended release and are healthy. Verifies that the runtime matches
`--live-*-ref`, that those images carry `org.opencontainers.image.revision ==
--application-source-sha` and `woodright.image.build_profile ==
production_candidate`, that the stack is healthy / private / media-mounted, and
that the pins currently equal `--pinned-*-ref`. Then it moves the pins forward
onto the live refs and rewrites `ACTIVE_OWNER` / `EXPECTED_RELEASE` /
`ACTIVE_RELEASE`. **Containers are not recreated** - `container_recreate_planned:
false`, `StartedAt_expected_unchanged: true`, and the helper fails if
`State.StartedAt` or the container id moves.

**`--recovery-mode restore-pinned-runtime`** - the live candidates must be
abandoned. The pins are (re)written to `--pinned-*-ref` and the runtime is
recreated onto them, backend then storefront. Old rollback images are **not**
required to carry `woodright.image.build_profile=production_candidate`; the
operator-supplied digests are the authority there, as long as they are present
locally (this helper never pulls).

```sh
ops/release/recover-production-candidate-skew.sh \
  --environment production \
  --recovery-mode adopt-live-candidates \
  --application-source-sha <40hex> \
  --live-backend-ref      ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \
  --live-storefront-ref   ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex> \
  --pinned-backend-ref    ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \
  --pinned-storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex>
# add --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY
```

Recovery exit codes: `0` committed, `2` validation, `3` lock, `4` dry-run
verification mismatch, `14` `recovery_incomplete` (pins moved, a later step is
unproven), `15` `recovery_runtime_restore_failed` (pins are at the pinned refs
but the runtime is not).

After a `14`, the **stale pins are deliberately not restored** - putting them
back would recreate the skew. Re-run the helper to finish the ownership
metadata. Evidence lives under
`/srv/woodright/reports/production/pin-runtime-skew-recovery-<UTC>/`.

## Anchors (digest, not tag)

Prefer exact OCI digests recorded at cutover time. Example prior foreign anchors
(replace with the cycle's recorded values):

- Backend: `ghcr.io/saintgroovie/woodright-backend@sha256:<prev>`
- Storefront: `ghcr.io/saintgroovie/woodright-storefront@sha256:<prev>`

### Keeper containers vs image anchors

- Production keepers **do not exist**: the cutover helper never renames a live
  container aside (a renamed container keeps its Compose project labels, so the
  next `compose up` destroys it).
- Rollback uses **immutable image digests** (local `docker image inspect` and/or GHCR pull) plus backed-up compose `.env` / `docker-compose.yml`.
- Staging may still have unrelated keeper containers - never use those for production.

## Phase A - incident + lock

1. Record incident reason + UTC timestamp.
2. Acquire `/srv/woodright/locks/live-cutover.lock` via
   `ops/lib/woodright-staging-mutation-lock.sh` (covers live production mutations).
3. Confirm target containers: `woodright-production-backend`,
   `woodright-production-storefront`, DB `woodright_production`.
4. Refuse parallel deploy / migrate / backup actors.

## Phase B - quiesce writers

1. Identify writers against `woodright_production`:
   - `woodright-production-backend`
   - any one-shot migrate/exec containers
   - operator interactive `psql` / `medusa exec`
2. Stop backend (and storefront if it may write) with compose:
   `cd /etc/dokploy/compose/woodright-production/code && docker compose --env-file .env stop backend storefront`
3. Terminate non-operator sessions and confirm **zero** unexpected connections:

```sh
docker exec woodright-production-postgres psql -U woodright_production -d postgres -v ON_ERROR_STOP=1 -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'woodright_production'
  AND pid <> pg_backend_pid();
"
docker exec woodright-production-postgres psql -U woodright_production -d postgres -Atc "
SELECT count(*) FROM pg_stat_activity
WHERE datname='woodright_production' AND pid <> pg_backend_pid();
"
# must print 0 before continuing
```

4. Record quiesce UTC timestamp.

## Phase C - preserve failed state

If DB still reachable, take an incident dump (`-Fc`) + checksum before overwrite.
Save: migration ledger, container inspect, pins/digests, recent logs (redacted).

## Phase D - restore target DB

**Never** restore into staging/demo DB. Confirm target identity explicitly.

**Do not** rely on in-place `pg_restore --clean --if-exists` against a long-lived
production DB as the sole strategy: objects created after the dump TOC can survive
and create a hybrid schema.

Required clean strategy (pick one, document which):

1. **Preferred:** create replacement DB `woodright_production_restore_<UTC>`, restore into it with
   `pg_restore --exit-on-error --no-owner` (and `--single-transaction` when dump format allows),
   verify (Phase E), then swap by renaming DBs under quiesce
   (old → `_failed_<UTC>`, new → `woodright_production`).
2. **Alternate:** `DROP DATABASE woodright_production` (after terminate) →
   `CREATE DATABASE woodright_production` → restore into empty DB with `--exit-on-error`.
   Abort and recover from the Phase C incident dump if restore fails mid-way.

Example restore into an empty/replacement DB:

```sh
docker cp /path/to/woodright_production.dump woodright-production-postgres:/tmp/restore.dump
docker exec woodright-production-postgres \
  pg_restore -U woodright_production -d woodright_production_restore_<UTC> \
  --exit-on-error --no-owner --no-acl -Fc /tmp/restore.dump
```

If restoring an older dump that lacks later Medusa migrations required by the target image,
re-run `medusa db:migrate --skip-scripts` from the **target** image after restore and before resume.

## Phase E - verify restored DB (before writers)

- restore exit code 0
- `pg_restore -l` / object counts
- `mikro_orm_migrations` includes required release migrations
- required tables/indexes (sales policy, order process/access, tax-line `data` columns when on post-7628056d schema)
- representative product/order counts (counts only - no PII)
- DB name identity; application role can connect

## Phase F - restore images/config

1. Restore backed-up compose `.env` + `docker-compose.yml` (exact previous SHA + digests).
2. `docker image inspect` / GHCR manifest for previous digests.
3. No mutable tags as authority.

## Phase G - controlled resume

1. Start backend first; wait healthy.
2. Confirm migrations do not unexpectedly re-apply destructive changes.
3. Start storefront; wait healthy.
4. Resume workers/jobs if any.
5. Smoke localhost `:9200` / `:3200`.
6. Release lock only after stability.

## Phase H - post-restore verification

Two HTTP rounds: health, release headers, catalog, Rooms, cart, track, Admin shell, media.
Confirm staging/public-demo unchanged. No DNS / `woodright.ru` changes in this procedure.
