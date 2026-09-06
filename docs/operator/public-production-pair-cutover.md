# Isolated `public_production` pair cutover

This is the canonical helper for the **isolated new-stack production pair**.

It is **not** an apex launch.

## Environments

| Environment | Helper | What it is |
|---|---|---|
| `public_demo` | `ops/release/cutover-public-demo-pair.sh` | Buyer-accessible demo (`woodright-demo.ru`) |
| `production` | `ops/release/cutover-production-candidate.sh` | Private / noindex candidate (`127.0.0.1:3200` / `:9200`) |
| `public_production` | `ops/release/cutover-public-production-pair.sh` | Isolated new-stack production pair (`127.0.0.1:3300` / `:9300`), loopback, `HOST_PUBLISH_POLICY=loopback_allowlist` |

`public_production` pair cutover does **not** mutate DNS or CS-Cart.

`woodright.ru` remains the legacy CS-Cart apex until a **separate** owner-authorized apex migration. Do not treat this helper as "launch apex". Apex routing (Traefik + documented ITB DNS, no pair recreate) is `docs/operator/public-apex-cutover.md` / `ops/release/cutover-public-apex-routing.sh`.

## Topology (unchanged by this helper)

- Compose: `/etc/dokploy/compose/woodright-public-production`
- Storefront loopback: `127.0.0.1:3300`
- Backend loopback: `127.0.0.1:9300`
- Lock: `/srv/woodright/locks/public_production/live-cutover.lock`
- Containers: `woodright-public-production-storefront` / `woodright-public-production-backend`

## SHA layers (do not conflate)

- **Application source SHA** = OCI `org.opencontainers.image.revision` of the baked pair. This is the only application authority for the cutover.
- **Artifact digests** = immutable RepoDigests of that bake (production profile).
- **Ops helper SHA** = the commit that installed this script after canonical merge. Newer tooling may cut over an earlier approved application SHA. Do **not** deploy ops HEAD as application source.

Exact already-baked `ced2510` pair (example of invocation identity, not script constants):

```
--source-sha ced25101f71f34caf98b62d1e7855be4f91ef977
--storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:39b244717c45249971cb55c7c702a2bbb9fad48a2d0fa7c5d55fca39ade05b9c
--backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:8f097c9d9f82a6cf79e9ee970ac96aed1577e37d75275e027cc0cef0ca845339
```

## Forward + rollback

- Pair-only. Backend then storefront under one lock.
- Fresh live CAS under lock is rollback authority. Caller-supplied old digests are not.
- Automatic pin-restore rollback on second-component / health / Gate C failure.
- Keepers are not used (Compose project labels would destroy them).
- Legal pack: this helper never **writes** `OWNER_LEGAL_CONTENT_APPROVED` or `WOODRIGHT_LEGAL_PACK_TOKEN`. An already-recorded owner approval in `public_production.conf` is allowed and left untouched.

SSH identity is operator input (`ssh -i <IdentityFile>` or host alias). Do not hardcode a machine-specific private-key path in this repo.

## Owner approval write

```
bash ops/release/reconcile-owner-approved-release.sh \
  --environment public_production \
  --application-sha <40hex> \
  --backend-digest sha256:<64hex> \
  --storefront-digest sha256:<64hex> \
  ...
```

`--environment production` is refused. A manifest whose `environment` field is `production` cannot satisfy a `public_production` cutover gate.

## Canonical merge required

Do **not** run a branch-local copy of this helper against the VM. Production mutation is allowed only after this helper is merged into canonical ops.
