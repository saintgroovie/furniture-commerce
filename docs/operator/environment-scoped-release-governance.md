# Environment-scoped mutation authority (Woodright)

Mutating release scripts require explicit:

```bash
--environment public_demo
# or
--environment staging
# or
--environment production
```

No default. Inherited `WOODRIGHT_ENVIRONMENT` alone is not authority (conflicts fail-closed).

## Profiles (`ops/config/runtime-environments/`)

| Id | Class | Provisioned on demo VM | Buyer domain | Notes |
|----|-------|------------------------|--------------|-------|
| `public_demo` | PUBLIC_DEMO | yes | `woodright-demo.ru` | Canonical public buyer pair. Containers historically named `woodright-staging-*` - **name ≠ environment**. |
| `staging` | STAGING_PRIVATE | **no** | none | Not an alias for public_demo. Mutators fail closed (`ENVIRONMENT_PROVISIONED=0`). |
| `production` | PRODUCTION_CANDIDATE | yes | loopback only | Private candidate (`woodright-production-*`). Not public `woodright.ru`. |

Dokploy project/app UUIDs are often absent on container labels; profiles pin compose directory/project, name prefixes, media volume, DB alias, ownership dir, identity dir, evidence root, and lock path.

## Locks

| Environment | Lock |
|-------------|------|
| public_demo | `/srv/woodright/locks/public_demo/live-cutover.lock` |
| staging | `/srv/woodright/locks/staging/live-cutover.lock` |
| production | `/srv/woodright/locks/production/live-cutover.lock` |

Legacy shared `/srv/woodright/locks/live-cutover.lock` must not be used for new environment cutovers (incident `formal-pass-24f7dc9`).

Lock metadata includes environment, actor, command, PID, hostname, target SHA/digest/component, compose project, container names. Metadata environment must match the loaded profile.

## Ownership / identity isolation

| Environment | Ownership root | Identity root |
|-------------|----------------|---------------|
| public_demo | `/srv/woodright/runtime-ownership-public-demo/` | `/srv/woodright/runtime-identity-public-demo/` |
| staging | `/srv/woodright/runtime-ownership-staging/` | `/srv/woodright/runtime-identity-staging/` |
| production | `/srv/woodright/runtime-ownership-production/` | `/srv/woodright/runtime-identity-production/` |

A process for one environment cannot write another environment's ACTIVE/EXPECTED/ACTIVE_PUBLIC paths.

## Host-publish contract

Profile authority (not inherited boolean):

| Field | Meaning |
|-------|---------|
| `WOODRIGHT_HOST_PUBLISH_POLICY` | `deny` or `loopback_allowlist` (required; missing → fail) |
| `WOODRIGHT_ALLOWED_HOST_BINDINGS` | Exact tokens `role:cport/proto=host_ip:host_port` (comma-separated, no whitespace) |

| Environment | Policy | Allowed bindings |
|-------------|--------|------------------|
| `public_demo` | `deny` | none (Traefik only) |
| `staging` | `deny` | none (unprovisioned) |
| `production` (private candidate) | `loopback_allowlist` | `storefront:3002/tcp=127.0.0.1:3200`, `backend:9000/tcp=127.0.0.1:9200` |

Forbidden: `0.0.0.0`, empty HostIp, `::`, public interface IPs, undeclared ports, UDP (unless declared), host networking, role/port mismatches.

Legacy `WOODRIGHT_ALLOW_HOST_PUBLISH` / `WOODRIGHT_ALLOWED_HOST_BIND_PREFIX` are **ignored** by gates.

Library: `ops/lib/woodright-host-publish.sh`
Monitor: `ops/monitoring/woodright-host-publish-check.sh --environment <id>`
Fidelity: `bash scripts/ops/test-host-publish-fidelity.sh`
Root monitor unit must pass `--environment public_demo` (see `ops/systemd/woodright-monitor.service`).

Mode A (planned) runs in media pre-promote; Mode B (live Docker) in post-promote + host-publish monitor.

## Component authority

```bash
--component storefront|backend|pair
```

Storefront-only freezes the live backend digest; changing it is fail-closed (P0).

## OCI / source SHA

`org.opencontainers.image.revision` must equal the expected source SHA for each mutated component before env/public `release-sha` writes. The `formal-pass-24f7dc9` class (SF OCI `7628056d` + env/header `24f7dc9`) is rejected.

## Validation freeze

`ops/lib/woodright-validation-freeze.sh` - bounded lease per environment for QA windows. Mutators refuse while unexpired unless audited override.

## Install on VM

```bash
bash ops/release/install-environment-governance.sh --source-sha <merged-main-sha>
```

Install copies helpers/profiles only. It does **not** recreate containers or change image digests.

## Fidelity

```bash
bash scripts/ops/test-environment-governance-fidelity.sh
```

## Validation freeze hold for QA cycles

Official deep validation / stability watches must hold a bounded freeze on the **same** environment authority as the mutators under test:

- buyer demo (`woodright-demo.ru`) → `public_demo`
- unprovisioned private staging → `staging` (when provisioned)

`staging` is **not** an alias of `public_demo`. A `staging` freeze does not protect the public demo stack.

```bash
source ops/lib/woodright-hold-validation-freeze.sh
# Buyer demo QA
wr_hold_validation_freeze_for_command public_demo \
  "qa-operator" "cycle-id" "bounded-validation" 1800 -- \
  ./your-validation-entrypoint.sh --environment public_demo

# Private staging QA (only when that environment is provisioned)
wr_hold_validation_freeze_for_command staging \
  "qa-operator" "cycle-id" "bounded-validation" 1800 -- \
  ./your-validation-entrypoint.sh --environment staging
```

Ordinary one-off public curl does not require a freeze. Mutators refuse an active freeze unless an audited override is set.
Storefront digest cutovers must use `ops/release/recreate-staging-storefront.sh` (inherits OCI labels from the image; do not copy previous container Labels).
