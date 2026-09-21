# Public production launch observation - 2026-09-22

Buyer apex was already on the new stack when this cycle started.
This record verifies that state. It does not describe a DNS mutation performed here.

## Identity

| Item | Value |
| --- | --- |
| Observed | 2026-09-22 02:42 MSK |
| Host | Timeweb `200.169.188.39` (`woodright-demo` / SSH alias `woodright-demo-vm`) |
| App SHA | `931140158756b921100e4f97cf1f27cd3ba61bc2` |
| Storefront image | `ghcr.io/saintgroovie/woodright-storefront@sha256:e80060dede166105d84443e92e90b779d432333128f79aea2771671dea376f29` |
| Backend image | `ghcr.io/saintgroovie/woodright-backend@sha256:5d5a0701ee7d7e6f50e2c347b93e7e6a3475c52091396685631671e572b54888` |
| Runtime | `public_production` / `public_production_db` / database `woodright_public_production` |
| Loopback | storefront `127.0.0.1:3300`, backend `127.0.0.1:9300`, Postgres `127.0.0.1:5434` |
| RestartCount | storefront, backend, postgres, redis = 0, healthy |

`origin/main` at observation was `a2a6d9b581f4ad32daeb9b0634d12d10e1f333ec`.
The two commits after `9311401` are ops-only (dokploy `backend` alias guard).
They are not baked into the running images. Live storefront DNS name `backend`
resolves to the production backend (`172.20.0.4`), not the demo backend.

## DNS

Authoritative `ns1.itb-host.ru` (AA):

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| `woodright.ru` | A | `200.169.188.39` | 3600 |
| `www.woodright.ru` | A | `200.169.188.39` | 3600 |
| `api.woodright.ru` | A | `200.169.188.39` | 3600 |

MX left as `10 mx.yandex.net` / `20 mail.woodright.ru`.
This cycle did not change DNS.
Legacy web rollback target remains `79.133.175.43` (nginx 1.30.2, PHP 7.4.33). It was read, not modified.

## TLS

Let's Encrypt, verify ok.

- `woodright.ru` CN/SAN `woodright.ru`, notAfter 2026-12-20
- `api.woodright.ru` CN/SAN `api.woodright.ru`, notAfter 2026-12-20
- `www` HTTPS redirects to `https://woodright.ru/`

## Prices

Retail Price 18.09.2026 safe batch still matches on the public production API.
Sample bases: GR-14-1 89700, OL-08-1 34950, OL-08-1-MIR 19950, OL-16-2 109200,
BA-05-3 124300, TE-05-3 124300, PV-55-1 19900.
FA-05-3 / PA-05-3 / RS-05-3 remain 113080 and were not rewritten.

## Commercial / legal

Storefront process has `WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED`,
`WOODRIGHT_PAYMENT_MODE=manual_invoice` with `accepted_manual`,
and `WOODRIGHT_NOTIFICATION_MODE=admin_polling`.
`/offer`, `/payment`, `/privacy`, `/delivery`, `/warranty`, `/returns` returned 200.
Offer and privacy name ООО «Роэл-Техник». Payment copy says the buyer does not pay on the site.

## SEO

- robots.txt allows `/` and points at `https://woodright.ru/sitemap.xml`
- sitemap 179 URLs, all on `https://woodright.ru`, demo host count 0
- homepage HTML has no `woodright-demo.ru` and no `noindex`
- HTTP apex redirects to HTTPS
- Known gap: `https://woodright.ru/kollekcii` is 404. There is no full CS-Cart redirect matrix in `next.config.js` (only designers/bespoke aliases)

## Media

No media bytes were changed. Canonical files on
`woodright-public-production_woodright_public_media` were not recompressed.
Originals preserved: yes.
In-place JPEG recompression was not applied: the running release serves those files directly, and a lossy or in-place rewrite was not acceptable on the live volume.

## Cart smoke

Public Store API: create cart, add PV-55-1, set quantity 2, delete the line.
Cart empty afterwards. No checkout submit and no buyer notification.

## Isolation

Demo `https://woodright-demo.ru` stays `public_demo` / `public_demo_db` and `noindex`.
Demo and production Postgres are different containers (`172.19.0.x` vs `172.20.0.x`).

## Recovery

Automated backup directory `/srv/woodright/backups/automated/public-production`
exists (directory mtime 2026-09-21 10:32 UTC). This SSH user cannot read the root-owned files, so no checksum is recorded here.
App rollback is the current image digests above.
DNS rollback is the legacy A `79.133.175.43` for apex and www, and removal of the `api` A. Not executed.

## Deferred

- Princess Rose / Monchelsea / Oxford and the supplement board
- Pending legacy media candidates
- OL-08-1-MIR `dimensions_normalized` still copied from the bedside table
- FA/PA/RS body depth 560 vs SKU 05-3
- Full legacy URL redirect matrix (`/kollekcii` and other CS-Cart paths)
