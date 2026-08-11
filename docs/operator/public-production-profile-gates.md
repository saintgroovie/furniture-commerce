# Public production environment profile

## Purpose

`public_production` is a **distinct** environment class for the future public site
(`https://woodright.ru`). It is not a rename of:

- `public_demo` (buyer demo, noindex)
- `production` / `PRODUCTION_CANDIDATE` (private loopback candidate)

## Profile location

`ops/config/runtime-environments/public_production.conf`

Load only via:

```sh
bash -c 'source ops/lib/woodright-environment-profile.sh; wr_load_environment_profile public_production'
```

## SEO contract

| Mode | Meta / X-Robots | robots.txt | sitemap.xml |
|---|---|---|---|
| `demo_noindex` | noindex | `Disallow: /` | 404 |
| `private_noindex` | noindex | `Disallow: /` | 404 |
| `public_indexable` | indexable | `Allow: /` + Sitemap | 200 XML (apex HTTPS) |

Resolver: `apps/storefront/src/lib/seo-mode.ts`
Indexing helpers: `apps/storefront/src/lib/indexing-policy.ts`
Missing PDP: framework `notFound()` (true HTTP 404)

## Fail-closed launch gates

Profile schema can validate while launch remains blocked until:

1. exact `public_production` owner approval manifest
2. `LEGAL_CONTENT_STATUS=approved`
3. payment owner decision (`WOODRIGHT_PAYMENT_DECISION_STATUS=accepted_manual` with `WOODRIGHT_PAYMENT_MODE=manual_invoice`)
4. notification/SMTP owner decision
5. public-production monitor + backup **contracts** present (repository); runtime provision still required
6. DNS/TLS/Traefik pre-DNS proof
7. qualified application images for the final application SHA (does **not** inherit `22cbd68` OWNER PASS)

### Public-ready `manual_invoice` (payment gate only)

Checkout creates the order without online capture (`pp_system_default` plumbing). There is **no** online PSP at launch.

| Field | Public-ready value |
|---|---|
| `WOODRIGHT_PAYMENT_MODE` | `manual_invoice` |
| `WOODRIGHT_PAYMENT_DECISION_STATUS` | `accepted_manual` |

Owner attestation means: buyer places an order on the site; payment happens after manager confirmation / invoice (manager payment link or requisites) - not card capture on the storefront.

Rules:

- `pending` / missing / unknown / bare `accepted` / `rejected` → payment gate closed
- `manual_invoice` alone never unlocks public payment readiness
- status flip without `manual_invoice` never unlocks
- payment gate readiness ≠ `launch_ready` and ≠ deploy / DNS / indexing approval
- fake notifications are unrelated to payment readiness
- production conf may stay `PAYMENT_DECISION_STATUS=pending` until a separate decision-recording batch
- rollback: set decision back to `pending` (or `rejected`) and keep non-public / non-indexable until re-attested

SoT helpers: `apps/storefront/src/lib/payment-readiness.ts`, `scripts/release/lib/payment-readiness.cjs`.

Validator:

```sh
node scripts/release/validate-public-production-profile.cjs
# STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_MONITOR_BACKUP_CONTRACTS_READY_RUNTIME_GATES_PENDING
```

Never treat that token as `launch_ready` or deploy authorization.

See also: `docs/operator/public-production-monitor-backup-recovery.md`.

## Isolation

Ownership, locks, reports, backup, and monitor paths under
`/srv/woodright/...-public-production` must not be shared with demo or candidate.
