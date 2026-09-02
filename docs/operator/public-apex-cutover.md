# Public apex cutover (buyer traffic: legacy CS-Cart → accepted public_production pair)

This is **not** an application pair deploy.

Isolated `public_production` pair cutover stays
`ops/release/cutover-public-production-pair.sh`.

This document is the buyer-traffic launch runbook. It does **not** authorize
the switch. Natural-language owner token (do not treat this file as issuing it):

`OWNER AUTHORIZE PUBLIC_APEX ROUTING CUTOVER`

Helper execute still requires:

- confirm `I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER`
- `/srv/woodright/meta/public_production/OWNER_APPROVED_APEX_LAUNCH.json`
  with token `OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH` and the **current** accepted
  SHA/digests (not a hardcoded historical release).

Accepted routing identity is derived, not hardcoded:

`OWNER_APPROVED_RELEASE.application_sha`
== `EXPECTED_RELEASE.application_source_sha`
== `ACTIVE_RELEASE.application_source_sha`
== live storefront/backend OCI + `WOODRIGHT_RELEASE_SHA`
== caller `--source-sha`

plus exact production-profile digests, role `public_production`,
DB `public_production_db`, and a fresh on-host recovery point
(age ≤ monitor `WOODRIGHT_BACKUP_CRIT_HOURS`, default 48h).

Stale leftover `/srv/woodright/runtime-ownership-public-production/OWNER_APPROVED_RELEASE.json`
is **not** authority. Live approval is
`/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json`.

Do not self-issue those tokens. Do not issue `OWNER_LEGAL_CONTENT_APPROVED` from
this runbook. Legal pack remains fail-closed (`isLegalLaunchComplete()` false)
and is **not** a hard apex-traffic gate: buyer pages already publish honest
production copy; `/offer` stays out of the sitemap until the legal token.
Legal / payment / notification remain DNS-launch gates, not this routing helper.

## Topology (read-only snapshot, 2026-09-02)

| Surface | Where | App |
|---|---|---|
| Buyer apex `https://woodright.ru` | A `79.133.175.43` TTL 3600, nginx 1.30.2 + PHP 7.4.33 CS-Cart | legacy |
| `www.woodright.ru` | same A, 301 → `https://woodright.ru` | legacy |
| `api.woodright.ru` | **no A/CNAME** | absent |
| New-stack VM | `89.169.188.29` | Dokploy Traefik `:80`/`:443` (demo public; production pair private) |
| Isolated SF | `127.0.0.1:3300` → container `:3002` | accepted `caf82b0` production-profile digest `sha256:4f05f940…16162ac4` |
| Isolated BE | `127.0.0.1:9300` → container `:9000` | accepted `caf82b0` production-profile digest `sha256:5bd38b41…a86618d` |
| Public demo | `https://woodright-demo.ru` Traefik file `woodright-demo.yml` | leave untouched |

After application pair recreate, production containers may sit only on
`woodright-public-production_woodright_public` until this helper attaches them
to `dokploy-network` with stable aliases. Traefik YAML already uses those names;
if the file matches the tracked template, execute is network-only (no YAML rewrite).

Nameservers: `ns1.itb-host.ru` / `ns2.itb-host.ru` (ITB panel, no repo CLI).

Mail: MX `10 mx.yandex.net` + `20 mail.woodright.ru`. SPF `ip4:79.133.175.238 a mx ~all`.
Do **not** edit MX/TXT/NS during web cutover. Changing web A expands SPF `a` to the new-stack IP.

## Actual cutover mechanism

`DNS_PLUS_PROXY`

Not reverse-proxy-only: legacy web is a **different host** (`79.133.175.43`).
This operator identity cannot SSH that host. Not DNS-only: Traefik cannot reach
production containers until they share `dokploy-network`.

Smallest safe path that does **not** recreate the accepted pair:

1. Connect exact current SF/BE container IDs to `dokploy-network` with required aliases.
2. Keep `/etc/dokploy/traefik/dynamic/woodright-public-production.yml` if it already
   matches `ops/config/public-launch/traefik-public-production.yml`; otherwise install it.
3. **STOP.** Buyers stay on legacy until a **separate** ITB DNS owner action.
4. After DNS: Traefik ACME HTTP-01 can issue `woodright.ru` certs.

Do **not** rewrite production YAML to ephemeral IPs when stable Docker DNS names work.
Do **not** publish raw `:3300` / `:9300` on `0.0.0.0`. Do **not** add `admin.woodright.ru`.

## Preconditions

- Live pair matches authoritative accepted metadata (currently `caf82b0` production digests), healthy, **RestartCount 0**, profile `public_production`.
- Fresh public_production recovery point (helper
  `ops/backup/woodright-public-production-backup-run.sh --environment public_production`).
  Restore rehearsal (`verification_status=verified`) is a **DNS/launch** gate, not this routing helper.
- Canonical helper installed from **merged** main (no branch-local execute).
- Owner file `/srv/woodright/meta/public_production/OWNER_APPROVED_APEX_LAUNCH.json`
  with token `OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH` and the same SHA/digests.
- DNS CAS still shows legacy A `79.133.175.43` for apex/www and empty `api`.
- Demo Traefik file still serves `woodright-demo.ru`.

## Exact future cutover sequence

1. Acquire launch window with operator present for ≥60 minutes after DNS.
2. `bash ops/release/cutover-public-apex-routing.sh --environment public_production --mode dry-run --source-sha caf82b048b9caefae30679342aec3d4fc42a8d89 --storefront-digest sha256:4f05f9400b5d228e6217d90c4e53d8552e8bdb13ec72776eea265a6e16162ac4 --backend-digest sha256:5bd38b417fb5141c43fe7e6f5d4f8f2a4283e69c5d3f497f534005322a86618d`
3. Verify latest recovery point is fresh (`application_sha` matches, env/db match).
4. Write owner approval JSON (owner, not the agent).
5. Execute the same helper with `--mode execute --confirm I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER`.
   This does **not** move buyers. Loopback pair stays on `127.0.0.1`.
   Shared-network attach is transaction-owned: rollback disconnects only memberships
   this helper added, and only if the live container ID still matches the journaled ID.
   Pre-existing `dokploy-network` membership is retained.
   Dry-run writes evidence JSON only (`routing-plan.json`, `preflight.json`); it does
   **not** mutate Docker, Traefik, or DNS.
   After the owned dynamic file is installed (or already matched), the helper **polls** Traefik on
   port 80 (`Host` / `--resolve` for apex, www, and api) until the file-provider
   watch converges: expected HTTPS redirect Location, twice in a row.
   Transient Traefik `404` / connection reset during that bounded window is
   retryable. Persistent `5xx`, a wrong Location, or deadline expiry fail closed
   and run automatic `rollback_partial` (Traefik file if this helper created it, helper-added networks,
   **and** owned-state JSON). HTTPS/ACME still cannot succeed until DNS.
   Overrides: `WOODRIGHT_APEX_TRAEFIK_SETTLE_TIMEOUT_SEC` (default 45),
   `WOODRIGHT_APEX_TRAEFIK_SETTLE_INTERVAL_SEC` (default 1),
   `WOODRIGHT_APEX_TRAEFIK_SETTLE_REQUIRED_STREAK` (default 2).
   Helper-owned Traefik may remain staged while DNS stays on legacy CS-Cart.
   That is the intended ITB operator window. Do not auto-rollback solely because
   this identity cannot mutate ITB DNS. Buyers remain on `79.133.175.43` until
   A records move.
6. ITB panel DNS (authorized launch mutation, not this readiness cycle):
   - create A `api.woodright.ru` → `89.169.188.29`
   - retarget A `woodright.ru` and `www.woodright.ru` → `89.169.188.29`
   - leave MX/TXT/NS unchanged
7. Immediate health: TLS for apex/www/api, HTML 200, CSS 200, `/health` on API, `x-woodright-release-sha` = accepted production SHA, no redirect loop.
8. Buyer smoke (non-destructive): home, catalog, Kids, PDP, cart, checkout to submit-safe point, contacts, delivery, payment, returns, warranty, privacy, offer, Bespoke, Designers.
9. Observe 1 / 5 / 15 / 30 / 60 minutes, then continue through at least one DNS TTL plus margin (prefer 2 hours): 5xx, restarts, TLS, orders in Admin **and** leftover CS-Cart.
10. Keep evidence under `/srv/woodright/reports/public_production/apex-routing-*`.

## Exact rollback sequence

Traffic rollback **does not** revert the accepted application pair.

1. If buyers are already on the new IP: ITB restore A `woodright.ru` and `www` to `79.133.175.43`; delete `api` A.
2. Wait until `dig +short A` for `woodright.ru` and `www.woodright.ru` is `79.133.175.43` and `api.woodright.ru` is empty. Helper rollback refuses until all three match. There is no force bypass.
3. `bash ops/release/cutover-public-apex-routing.sh --environment public_production --mode rollback` with the same SHA/digest flags.
4. Confirm `https://woodright.ru` is CS-Cart again (`x-powered-by: PHP/7.4.33`).
5. Confirm demo still 200. Confirm isolated pair still the accepted production SHA on loopback.

## Automatic rollback triggers (P0)

Roll buyers back to legacy DNS immediately (no owner question) if after DNS switch:

- TLS warning / cert mismatch on apex, www, or api
- apex 5xx
- API unreachable
- CSS/JS 400/404 (looks like a dead site)
- cart or checkout broken
- wrong `x-woodright-release-sha` or digests
- CORS failure on the buyer journey
- redirect loop
- new-stack restart loop
- order submit impossible

Do **not** recreate or pin-restore the pair unless the pair itself is unhealthy.

## Split-brain / legacy orders

TTL 3600s: after DNS retarget, some resolvers keep hitting CS-Cart for up to one hour.

- Leave legacy CS-Cart running as the rollback target.
- Do not import late CS-Cart orders into Medusa.
- Capture any late legacy orders in the CS-Cart admin and handle them operationally.
- Existing CS-Cart carts do not transfer.

No maintenance page required for an instantaneous DNS+proxy switch; expect mixed origins during TTL, not a planned downtime window.

## Legal / payment / orders

- Legal token: fail-closed pack only. Apex traffic may launch without it.
- Payment: OD-05 manager PaymentLink / invoice. No online acquiring.
- Notifications: `WOODRIGHT_NOTIFICATIONS` unset → in-process fake; manager process is **Admin polling** via private loopback (`127.0.0.1:9300` + SSH tunnel). Launch requires an operator watching Admin during buyer hours. Not a silent black hole if Admin is watched.
- Admin stays private. No public admin host.

## No-go

- Live pair moved off the authoritative accepted SHA / production digests
- DNS already changed externally (CAS mismatch)
- Traefik target file exists with unexpected content
- Unhealthy pair or restart loop
- Demo Traefik identity lost
- No owner apex token
- Helper not installed from merged canonical ops
