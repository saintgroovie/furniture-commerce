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
