# TLS plan - Woodright public launch (planning document only)

Status: planning only. No ACME run has been executed. No DNS or Traefik
change has been applied. This document does not authorize any of the
actions it describes - it exists so an approved cutover has a written plan
to follow, with an explicit approval gate before each irreversible step.

## Scope

- `woodright.ru` (apex)
- `www.woodright.ru`
- `api.woodright.ru`

No other hosts (no `admin.woodright.ru`, no demo hosts) are in scope for
this plan.

## Certificate strategy

- **Challenge type:** HTTP-01 (ACME), via the existing Traefik ACME
  resolver/storage already used for other Woodright hosts. Do not introduce
  a second ACME account/storage path without a separate decision - reuse the
  existing resolver referenced in
  `ops/config/public-launch/traefik-production.template.yml`
  (`certResolver: letsencrypt`).
- **SANs required:**
  - `woodright.ru`
  - `www.woodright.ru`
  - `api.woodright.ru`
  - (Each host above can be its own certificate via Traefik's per-router ACME,
    or combined - decide at cutover time based on the existing resolver's
    current pattern. Do not invent a wildcard cert plan here.)
- **HTTP-01 prerequisite:** DNS for all three hosts must resolve to the
  Traefik entrypoint's public IP *before* the ACME challenge is attempted.
  See `ops/config/public-launch/dns-rollback-plan.md` for the DNS side of
  this cutover and its rollback path.

## HSTS

- **No HSTS preload submission** as part of this plan. HSTS preload is a
  long-lived, hard-to-reverse commitment (browsers cache it independently of
  DNS/TLS state) and must not be requested until the domain has been stable
  in production for a separate, explicitly approved period.
- If Traefik's HSTS middleware is enabled for these hosts, keep `preload`
  disabled and keep `max-age` conservative until the owner explicitly
  approves a longer value. Do not enable HSTS at all until DNS + TLS have
  been verified stable end-to-end.

## Execution gate (not part of this document)

Actually requesting certificates, applying the Traefik dynamic config, and
cutting over DNS all require:

1. Explicit owner approval to proceed with the public-launch cutover.
2. `scripts/release/check-public-launch-readiness.cjs` returning a
   `*_ready_for_deploy_approval` status for the target launch mode.
3. A separate, reviewed change that applies
   `ops/config/public-launch/traefik-production.template.yml` (filled in,
   no placeholders) and the DNS changes in
   `ops/config/public-launch/dns-rollback-plan.md`.

This plan does not itself perform any of the above.
