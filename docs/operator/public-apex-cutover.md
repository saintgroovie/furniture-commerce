# Public apex cutover (buyer traffic: legacy CS-Cart → accepted `ced2510`)

This is **not** an application pair deploy.

Isolated `public_production` pair cutover stays
`ops/release/cutover-public-production-pair.sh`.

This document is the buyer-traffic launch runbook. It does **not** authorize
the switch. Required owner token:

`OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH_CED2510`

Do not self-issue that token. Do not issue `OWNER_LEGAL_CONTENT_APPROVED` from
this runbook. Legal pack remains fail-closed (`isLegalLaunchComplete()` false)
and is **not** a hard apex-traffic gate: buyer pages already publish honest
production copy; `/offer` stays out of the sitemap until the legal token.

## Topology (read-only snapshot, 2026-08-23)

| Surface | Where | App |
|---|---|---|
| Buyer apex `https://woodright.ru` | A `79.133.175.43` TTL 3600, nginx 1.30.2 + PHP 7.4.33 CS-Cart | legacy |
| `www.woodright.ru` | same A, 301 → `https://woodright.ru` | legacy |
| `api.woodright.ru` | **no A/CNAME** | absent |
| New-stack VM | `89.169.188.29` | Dokploy Traefik `:80`/`:443` (demo only) |
| Isolated SF | `127.0.0.1:3300` → container `:3002` | `ced2510` digest `sha256:39b24471…ade05b9c` |
| Isolated BE | `127.0.0.1:9300` → container `:9000` | `ced2510` digest `sha256:8f097c9d…ca845339` |
| Public demo | `https://woodright-demo.ru` Traefik file `woodright-demo.yml` | leave untouched |

Nameservers: `ns1.itb-host.ru` / `ns2.itb-host.ru` (ITB panel, no repo CLI).

Mail: MX `10 mx.yandex.net` + `20 mail.woodright.ru`. SPF `ip4:79.133.175.238 a mx ~all`.
Do **not** edit MX/TXT/NS during web cutover. Changing web A expands SPF `a` to the new-stack IP.

## Actual cutover mechanism

`DNS_PLUS_PROXY`

Not reverse-proxy-only: legacy web is a **different host** (`79.133.175.43`).
This operator identity cannot SSH that host. Not DNS-only: the new-stack VM has
no Traefik `Host(woodright.ru)` today, and public_production containers are
**not** on `dokploy-network`.

Smallest safe path that does **not** recreate `ced2510` containers:

1. Connect SF/BE to `dokploy-network`.
2. Install `/etc/dokploy/traefik/dynamic/woodright-public-production.yml`
   (tracked template `ops/config/public-launch/traefik-public-production.yml`).
3. Operator retargets ITB A records to `89.169.188.29` and creates `api` A.
4. Traefik ACME HTTP-01 issues certs (cannot succeed while DNS still points at legacy).

Do **not** publish raw `:3300` / `:9300`. Do **not** add `admin.woodright.ru`.

## Preconditions

- Live pair SHA `ced25101f71f34caf98b62d1e7855be4f91ef977` and the two digests above, healthy, **RestartCount 0**.
- Fresh public_production recovery point (helper
  `ops/backup/woodright-public-production-backup-run.sh --environment public_production`).
- Canonical helper installed from **merged** main (no branch-local execute).
- Owner file `/srv/woodright/meta/public_production/OWNER_APPROVED_APEX_LAUNCH.json`
  with token `OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH_CED2510` and the same SHA/digests.
- DNS CAS still shows legacy A `79.133.175.43` for apex/www and empty `api`.
- Demo Traefik file still serves `woodright-demo.ru`.

## Exact future cutover sequence

1. Acquire launch window with operator present for ≥60 minutes after DNS.
2. `bash ops/release/cutover-public-apex-routing.sh --environment public_production --mode dry-run --source-sha ced25101f71f34caf98b62d1e7855be4f91ef977 --storefront-digest sha256:39b244717c45249971cb55c7c702a2bbb9fad48a2d0fa7c5d55fca39ade05b9c --backend-digest sha256:8f097c9d9f82a6cf79e9ee970ac96aed1577e37d75275e027cc0cef0ca845339`
3. Verify latest recovery point is fresh.
4. Write owner approval JSON (owner, not the agent).
5. Execute the same helper with `--mode execute --confirm I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER`.
   This does **not** move buyers. Loopback pair stays on `127.0.0.1`.
   After the owned dynamic file is installed, the helper **polls** Traefik on
   port 80 (`Host` / `--resolve` for apex, www, and api) until the file-provider
   watch converges: expected HTTPS redirect Location, twice in a row.
   Transient Traefik `404` / connection reset during that bounded window is
   retryable. Persistent `5xx`, a wrong Location, or deadline expiry fail closed
   and run automatic `rollback_partial` (Traefik file, helper-added networks,
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
7. Immediate health: TLS for apex/www/api, HTML 200, CSS 200, `/health` on API, `x-woodright-release-sha` = `ced2510…`, no redirect loop.
8. Buyer smoke (non-destructive): home, catalog, Kids, PDP, cart, checkout to submit-safe point, contacts, delivery, payment, returns, warranty, privacy, offer, Bespoke, Designers.
9. Observe 1 / 5 / 15 / 30 / 60 minutes, then continue through at least one DNS TTL plus margin (prefer 2 hours): 5xx, restarts, TLS, orders in Admin **and** leftover CS-Cart.
10. Keep evidence under `/srv/woodright/reports/public_production/apex-routing-*`.

## Exact rollback sequence

Traffic rollback **does not** revert the `ced2510` pair.

1. If buyers are already on the new IP: ITB restore A `woodright.ru` and `www` to `79.133.175.43`; delete `api` A.
2. Wait until `dig +short A` for `woodright.ru` and `www.woodright.ru` is `79.133.175.43` and `api.woodright.ru` is empty. Helper rollback refuses until all three match. There is no force bypass.
3. `bash ops/release/cutover-public-apex-routing.sh --environment public_production --mode rollback` with the same SHA/digest flags.
4. Confirm `https://woodright.ru` is CS-Cart again (`x-powered-by: PHP/7.4.33`).
5. Confirm demo still 200. Confirm isolated pair still `ced2510` on loopback.

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

- Live pair moved off `ced2510` / accepted digests
- DNS already changed externally (CAS mismatch)
- Traefik target file exists with unexpected content
- Unhealthy pair or restart loop
- Demo Traefik identity lost
- No owner apex token
- Helper not installed from merged canonical ops
