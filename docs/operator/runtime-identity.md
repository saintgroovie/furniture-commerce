# Runtime identity (public demo vs private candidate)

Container and compose **names are not environment identity**.

Incident (2026-07-22): private `woodright-production-backend` on `127.0.0.1:9200` was mistaken for the public API. Public Traefik actually routes to `woodright-staging-*` + DB `woodright_staging`. That produced a false pricing incident (45 920 vs 51 030). Root cause: **runtime identity split-brain**, not pricing math.

## Canonical roles

| Role | Exposure | Legacy containers | DB (VM) | Public evidence |
|------|----------|-------------------|---------|-----------------|
| `public_demo` | `public` | `woodright-staging-*` | `woodright_staging` (alias `public_demo_db`) | yes - canonical domain only |
| `non_public_candidate` | `private` | `woodright-production-*` | `woodright_production` (alias `non_public_candidate_db`) | **never** |

Preferred report wording:

- `public_demo (legacy staging containers)`
- `non_public_candidate (legacy production containers)`

Do **not** write `staging` / `production` alone in new report packets without the runtime role.

## Machine-readable SoT (VM)

Directory: `/srv/woodright/runtime-identity/`

| File | Meaning |
|------|---------|
| `public-demo.json` | Full public identity snapshot |
| `non-public-candidate.json` | Full candidate identity snapshot |
| `ACTIVE_PUBLIC.json` | Symlink or copy of the Traefik-routed public identity |
| `NON_PUBLIC_CANDIDATE.json` | Symlink or copy of the private candidate identity |

Schema fields (no secrets):

`runtime_role`, `exposure`, `environment_label`, `canonical_domain`, `canonical_api_origin`, `release_sha`, `backend_image_digest`, `storefront_image_digest`, `backend_container`, `storefront_container`, `database_identity` (VM-only), `database_identity_alias` (headers), `deployment_owner`, `traefik_router`, `traefik_service`, `generated_at`, `schema_version`.

Git holds **templates/fixtures/generators/validators** only. Live container IDs stay on the VM.

### Stale ownership files

These may lag after mid-cycle cutovers:

- `/srv/woodright/runtime-ownership/ACTIVE_RELEASE.json`
- `/srv/woodright/runtime-ownership/STACKS.json` digests

Hierarchy:

1. **Traefik route + live container digests** (ground truth for public)
2. **`ACTIVE_PUBLIC.json`** (must match Traefik)
3. `ACTIVE_OWNER.json` (owner lock / digests for cutover)
4. Deprecated files must set `"deprecated": true` + `superseded_by` and must **not** be read as current identity by scripts

## Response headers

Backend (env-driven):

- `x-woodright-runtime-role`
- `x-woodright-exposure`
- `x-woodright-release-sha`
- `x-woodright-database-identity` (alias only: `public_demo_db` / `non_public_candidate_db`)
- existing `x-woodright-catalog-order: merchandising-v1` on catalog-products

Storefront: same role / exposure / release-sha headers (no DB name).

Never emit DSN, DB host, credentials, or internal IPs in headers.

Env vars:

```text
WOODRIGHT_RUNTIME_ROLE=public_demo|non_public_candidate
WOODRIGHT_EXPOSURE=public|private
WOODRIGHT_RELEASE_SHA=<40-hex>
WOODRIGHT_DATABASE_IDENTITY=public_demo_db|non_public_candidate_db
WOODRIGHT_DATABASE_IDENTITY_ALIAS=…   # legacy alias of WOODRIGHT_DATABASE_IDENTITY
WOODRIGHT_CANONICAL_DOMAIN=woodright-demo.ru|none
WOODRIGHT_CANONICAL_API_ORIGIN=https://api.woodright-demo.ru|none
```

## Container labels

```text
com.woodright.runtime-role
com.woodright.exposure
com.woodright.canonical-domain
com.woodright.release-sha
com.woodright.database-identity
com.woodright.deployment-owner
```

Do not change Traefik routing labels when only adding identity metadata.

## Verifiers

```bash
# Must PASS only for canonical public domain / API
bash scripts/verify-public-runtime-identity.sh \
  --url https://api.woodright-demo.ru/health \
  --identity-file /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json

# Explicitly rejects :9200 / localhost as public evidence (exit non-zero)
bash scripts/verify-public-runtime-identity.sh --url http://127.0.0.1:9200/health

# Candidate helper (never for public acceptance)
bash scripts/verify-candidate-runtime-identity.sh --url http://127.0.0.1:9200/health
```

Offline unit mode:

```bash
node scripts/release/verify-public-runtime-identity.cjs \
  --offline \
  --url https://api.woodright-demo.ru/health \
  --headers-json '{"x-woodright-runtime-role":"public_demo","x-woodright-exposure":"public","x-woodright-release-sha":"<sha>"}'
```

Pre-header rollout bridge (ops only): canonical public URL already classified OK **and** `--traefik-proof` **and** valid `ACTIVE_PUBLIC` identity. Identity file alone is never enough.

Digest check requires independently observed live digests:

```bash
node scripts/release/verify-public-runtime-identity.cjs \
  --url https://api.woodright-demo.ru/health \
  --identity-file /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json \
  --require-digest-match \
  --live-backend-digest sha256:... \
  --live-storefront-digest sha256:...
```

## Evidence classification

Every public evidence block must include:

- requested URL
- resolved runtime role / exposure
- release SHA + digests
- Traefik router/service
- DB identity **alias**
- container IDs
- timestamp
- `Evidence classification:` one of
  `public_domain_evidence` | `public_origin_evidence` | `candidate_evidence` | `local_dev_evidence` | `invalid_public_evidence`

Forbidden as public proof:

`backend localhost:9200 показал…`

Correct:

`non_public_candidate :9200 показал… - не используется для public acceptance`
(`Evidence classification: invalid_public_evidence`)

## Deployment preflight

Before public cutover:

```bash
node scripts/release/assert-public-deploy-target.cjs \
  --target-role public_demo \
  --health-url https://api.woodright-demo.ru/health \
  --identity-file /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json
```

Rejects `:9200` and non-public roles.

## Physical rename

Renaming `woodright-staging-*` / `woodright-production-*` or DB volumes is a **separate migration**. This identity layer must already make misclassification impossible without rename.

## Related

- `docs/operator/runtime-stack-registry.md`
- `docs/operator/runtime-ownership.md`
- `scripts/release/runtime-identity-lib.cjs`
- `scripts/release/validate-runtime-identity.cjs`
