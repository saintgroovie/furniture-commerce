# Production-candidate authority reconcile (private)

## Scope

Private `PRODUCTION_CANDIDATE` only. Not public launch. Not `public_demo`.

## SHA / identity layers

Keep these separate. Do not substitute one for another.

| Layer | Meaning | Authority? |
|---|---|---|
| `application_source_sha` | Full 40-hex Git SHA of the application images (OCI `org.opencontainers.image.revision`) | Yes - cutover target / ownership manifests |
| `operation_helper_install_sha` | Ops commit that installed the cutover/recovery helper performing an operation | Provenance only |
| `current_governance_install_sha` | Canonical installed governance bundle marker (`INSTALLED_ENV_GOVERNANCE_SHA.txt`) | Install/verify only |
| `WOODRIGHT_BACKEND_SOURCE_SHA` / `WOODRIGHT_STOREFRONT_SOURCE_SHA` | Compose env + headers `x-woodright-backend-source-sha` / `x-woodright-storefront-source-sha` | **No** for deploy/rollback (EXPECTED_RELEASE + image digests remain authority) - **Yes** for answering "which source SHA is this component running" |
| `WOODRIGHT_RELEASE_SHA` | Compose env + runtime header `x-woodright-release-sha` | **No** - last-unified-pair informational marker only |

`WOODRIGHT_RELEASE_SHA` is the last **unified** pair marker. It must **not** mean helper SHA, governance SHA, deployment lineage, Git branch, current `origin/main`, or the identity of a split live pair.

When backend OCI revision != storefront OCI revision, do not treat `WOODRIGHT_RELEASE_SHA` as pair identity. Authoritative runtime fields are:

- backend: `WOODRIGHT_BACKEND_SOURCE_SHA` and `EXPECTED_RELEASE.backend_source_sha` / `backend_digest`
- storefront: `WOODRIGHT_STOREFRONT_SOURCE_SHA` and `EXPECTED_RELEASE.storefront_source_sha` / `storefront_digest`

Monitor comparisons stay component ↔ component. Do not reintroduce a global-SHA digest gate.

Deploy / rollback authority remains:

- immutable image digests (pins + runtime RepoDigests);
- OCI revision equality to `application_source_sha`;
- scoped ACTIVE / OWNER / EXPECTED manifests.

A stale compose/header marker is classified `production_release_sha_marker_stale_non_blocking`. It does not require a live emergency fix and does not block a valid future pair cutover dry-run.

## Production compose template (component SHA injection)

Live Dokploy compose is:

`/etc/dokploy/compose/woodright-production/code/docker-compose.yml`

Canonical authority:

`ops/compose/woodright-production.docker-compose.yml`

Governance install copies the canonical file into `/srv/woodright/ops/compose/` and ships:

`ops/release/reconcile-production-candidate-compose-template.sh`

That helper is the only apply path onto the live Dokploy compose file. It does not rewrite `.env`, image pins, or `EXPECTED_RELEASE`, and it does not recreate containers. Execute takes the production mutation lock, writes a timestamped backup, validates the staged template with `docker compose config` against a dummy env (live `.env` secrets are not read), then atomically replaces the target while preserving destination owner/mode (same `sudo -n` install path as compose `.env` pins).

```sh
bash ops/release/reconcile-production-candidate-compose-template.sh \
  --environment production \
  --source-sha <40-hex-checkout-HEAD> \
  --repo-root /path/to/clean/checkout \
  --dry-run

# execute (separate owner authorization):
# --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_CANDIDATE_COMPOSE_TEMPLATE_RECONCILE
```

Unexpected live compose drift fails closed: remainder equality after stripping only comments, component-SHA env lines, `WOODRIGHT_RELEASE_SHA` `:-` form, and equivalent memory defaults. Extra services, env keys/values, healthchecks, volumes, ports, and other fields are not overwritten. Execute reads the canonical blob at `--source-sha:ops/compose/woodright-production.docker-compose.yml` (working tree must match that blob and be clean). Target is the fixed Dokploy production compose path; the fidelity harness may only use that same suffix under `/tmp`.

## Component-aware EXPECTED_RELEASE (pair identity)

`EXPECTED_RELEASE` after any successful cutover must hold both components:

- `storefront_digest` + `storefront_source_sha`
- `backend_digest` + `backend_source_sha`

`application_source_sha` is informational (mutated component SHA). The monitor compares each role to its own digest and source SHA. `WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1` stays fail-closed on an empty digest.

Single-component cutover preserves the untouched peer by live CAS (digest + OCI revision under the production lock). Do not hand-edit EXPECTED JSON.

If a past storefront-only cutover blanked `backend_digest`, rebind metadata only after proving live identities:

```sh
ops/release/reconcile-production-candidate-component-identities.sh \
  --environment production \
  --storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<live-sf> \
  --backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:<live-be> \
  --storefront-source-sha <40hex-live-sf-oci> \
  --backend-source-sha <40hex-live-be-oci> \
  --application-source-sha <40hex-mutated-component> \
  --dry-run

# execute (separate owner authorization):
# --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_COMPONENT_IDENTITY_REBIND
```

Install the helper via `ops/release/install-environment-governance.sh` before using a new bundle SHA. No container recreate. If live digest or revision disagrees with the declared args, the helper exits `LIVE_COMPONENT_IDENTITY_DRIFT`.

## Residuals this tooling closes

1. **Monitor false-critical media_mount** - health check used a hardcoded
   staging volume substring. Production profile already defines
   `WOODRIGHT_MEDIA_VOLUME=woodright-production_woodright-production_media`.
   Monitor now requires exact `Type=volume` + `Name` + `Destination` from the
   loaded governed profile (fail-closed).

2. **Stale compose `WOODRIGHT_RELEASE_SHA`** - pair cutover wrote image pins and
   ownership manifests but left the common compose release key untouched.
   Cutover / skew-recovery now include `WOODRIGHT_RELEASE_SHA` in the same
   atomic compose `.env` transaction when both pins prove OCI revision equals
   the application `SOURCE_SHA`.

3. **Metadata-only path** - when containers, digests, OCI revisions, and image
   pins are already correct, use either preferred thin entrypoint or the
   shared metadata helper:

```sh
# Preferred thin entrypoint (default dry-run):
ops/release/reconcile-production-release-sha.sh \
  --environment production \
  --application-source-sha <40hex> \
  --current-helper-install-sha <installed-ops-sha> \
  --storefront-ref ghcr.io/...@sha256:<64> \
  --backend-ref ghcr.io/...@sha256:<64>

# Equivalent:
ops/release/reconcile-production-candidate-metadata.sh \
  --environment production \
  --correction compose-common-release-sha \
  --application-source-sha <40hex> \
  --current-helper-install-sha <installed-ops-sha> \
  --storefront-ref ghcr.io/...@sha256:<64> \
  --backend-ref ghcr.io/...@sha256:<64> \
  --dry-run

# execute (separate owner authorization - not part of normal cutover dry-run):
# --execute --confirm-mutation I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION
```

Gates before any planned write (dry-run and execute): live RepoDigests, OCI
revisions, exact image pins, ownership `application_source_sha`, health,
profile role/exposure/DB alias, no public Traefik labels, and exact Docker
private host-publish contract (`HostConfig.PortBindings` agreeing with
`NetworkSettings.Ports`). Execute then takes the production mutation lock for
the metadata write path; exposure gates are fail-closed before that lock and
before evidence / `.env` mutation (they are not a substitute for locking
against external container replacement). No container recreate. Full compose
`.env` byte backup + checksummed restore on failure. Never prints env values.

### Exposure gates (independent)

Metadata-only release-SHA reconcile is allowed only when **both** pass:

1. **Traefik** - no public router / `traefik.enable=true` / forbidden domains on
   live containers.
2. **Docker published ports** - live inspect must match the production profile
   allowlist exactly:
   - storefront `127.0.0.1:3200` → container `3002/tcp`
   - backend `127.0.0.1:9200` → container `9000/tcp`
   - no extra published ports
   - reject `0.0.0.0`, empty `HostIp`, `::`, `[::]`, and any non-loopback IP

Loopback bind is **not** the same as “no Traefik”. Both gates run in dry-run
and execute, after read-only discovery and **before** any `.env` write / backup
publication / confirmation-gated mutation. Confirmation tokens cannot bypass
exposure gates.

`WOODRIGHT_RELEASE_SHA` in compose `.env` remains informational metadata and is
not publish authority. A stale marker may safely remain until the next governed
metadata reconcile or atomic pair cutover. Merging this source fix does **not**
authorize live reconcile; after governance install, run a new stabilization
gate before any owner `--execute`.

Dry-run packet fields include:

- `metadata_only=true`
- `container_recreate_planned=false`
- `pin_image_write_planned=false`
- `release_sha_write_planned=true`
- `runtime_recreate_planned=false`

## Atomic pair pin contract

One governed compose `.env` snapshot writes together:

- `WOODRIGHT_STOREFRONT_IMAGE=<immutable ref>`
- `WOODRIGHT_BACKEND_IMAGE=<immutable ref>`
- `WOODRIGHT_BACKEND_SOURCE_SHA=<40-hex backend OCI revision>`
- `WOODRIGHT_STOREFRONT_SOURCE_SHA=<40-hex storefront OCI revision>`
- `WOODRIGHT_RELEASE_SHA=<full application source SHA>` (only when both OCI revisions equal that SHA)

A single-component cutover still writes **both** source SHA keys (mutated component = `--source-sha`; untouched peer = live OCI revision under lock) and recreates **both** services so the peer picks up identity env without changing its image pin.

Write of the release marker is allowed only when:

- source SHA is full 40 hex;
- storefront and backend OCI revisions both equal that SHA;
- both images carry `production_candidate` profile;
- immutable refs validate;
- production registry authority passes.

Forbidden: deriving the marker from helper install SHA or `origin/main`;
mutable tags; writing the marker after pin publication as a second step;
treating the marker as deploy/rollback authority.

Pin backup includes the previous `WOODRIGHT_RELEASE_SHA`. Rollback restores
old image refs and the old marker as one snapshot. If images restore but the
marker does not, terminal state is `rollback_incomplete` (exit 13) - never a
false `rolled_back`.

## Installer concurrency

`install-environment-governance.sh` holds
`/srv/woodright/locks/env-governance-install.lock` and environment runtime
locks for the whole install. Concurrent installers fail closed. Canonical
marker is
`/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt`; legacy root
mirrors must match after install.

## Header semantics

`x-woodright-backend-source-sha` and `x-woodright-storefront-source-sha` reflect the component compose env keys.

`x-woodright-release-sha` is emitted only when the pair is unified (both component SHAs present and equal, and equal `WOODRIGHT_RELEASE_SHA`) or when the runtime is legacy (neither component SHA set). A split pair omits the global header.

These headers are diagnostic only: not OCI authority, not a substitute for `EXPECTED_RELEASE` digests, and not a monitor compare key.

## Success matrix

After a **pair** cutover: `WOODRIGHT_RELEASE_SHA` == backend OCI == storefront OCI == both component source SHA pins.

After a **split** cutover: each `WOODRIGHT_*_SOURCE_SHA` equals that component's OCI revision; `WOODRIGHT_RELEASE_SHA` stays the previous unified marker (informational); monitor `discovery_sf`/`discovery_be` and `digest_sf`/`digest_be` still compare component ↔ expected component.

Production-candidate monitor `overall=ok` still requires the profile media volume and is independent of host disk `pct` (disk is a separate task).
