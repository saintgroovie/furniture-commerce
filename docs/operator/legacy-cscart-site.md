# Legacy live site (CS-Cart on ITB)

Live buyer apex `https://woodright.ru` is still the **old CS-Cart** site. A previous contractor currently operates it on ITB hosting. This is **not** the new Medusa / Dokploy / Timeweb stack.

This file is the git-safe index. **Passwords are not here.**

## What it is

| Item | Current fact (ISP panel, 2026-09-18) |
|---|---|
| Public site | `https://woodright.ru` (alias `www.woodright.ru`) |
| Account | ispmanager user `u232077` on `https://isp232.itb-host.ru/` |
| Stack | nginx 1.30.2 + Apache 2.4.62 + PHP **7.4.33 LSAPI (alt)** + CS-Cart in `/www/woodright.ru` |
| Host IPv4 | `79.133.175.43` (also unused shared `79.133.175.44` on the account) |
| DNS | One master zone `woodright.ru`, NS `ns1.itb-host.ru` / `ns2.itb-host.ru`, DNSSEC off |
| SSL | Let's Encrypt `woodright.ru_le2` on `woodright.ru` + `www`, **expires 2026-12-17** (issued 2026-09-18; replaced `woodright.ru_le1`). Leftover unused: `woodright.ru_le1` until 2026-10-19, self-signed `woodright.ru` until 2027-01-21. Brief ACME window served a self-signed cert, then live TLS returned to Let's Encrypt. |
| DB | one MySQL 8.0.45 schema `u232077_db` ~430 MB on localhost |
| Cron | empty |
| WordPress | none |
| Mail in panel | none (`limit_emails=0`); MX stays Yandex |
| New stack | Separate (Timeweb demo / public_production). Do not mix credentials |

## DNS zone (no secrets; TTL 3600)

| Record | Type | Value |
|---|---|---|
| `woodright.ru` | A | `79.133.175.43` |
| `www.woodright.ru` | A | `79.133.175.43` |
| `woodright.ru` | MX 10 | `mx.yandex.net` |
| `woodright.ru` | MX 20 | `mail.woodright.ru` (**no A for that name in this zone**) |
| `woodright.ru` | NS | `ns1.itb-host.ru` / `ns2.itb-host.ru` |
| `woodright.ru` | TXT | `v=spf1 ip4:79.133.175.238 a mx ~all` |
| `efwe.woodright.ru` | TXT | `wfef` (junk) |

**Absent:** `api.woodright.ru`, DKIM, DMARC. SOA serial `2026021509`.

Do **not** edit MX / TXT / NS on web cutover. Changing the apex A expands SPF `a` to the new IP.

## Local copies (outside git)

Owner-authorized 2026-09-18 pull. Files are **not** in this repo (`*.sql` / archives gitignored). Mode `0600` under:

`/Users/leonidmbp/Documents/woodright-legacy-private-export/operator-access/downloads-20260918/`

| File | Size | Notes |
|---|---|---|
| `u232077_db.sql` | 283 MB | Fresh mysqldump; 260 `CREATE TABLE`; completed 2026-09-18 18:47 MSK |
| `2026-09-12.u232077.tar.gz` | 2.0 GB | Panel full backup; `gzip -t` OK; contains `.system/db.mysql.u232077_db` + `data/` |
| `from-backup-20260912/` | small | Extracted from that archive only: `config.local.php`, `config.php`, `.htaccess`, `admin.php`, `robots.txt`, backup metadata |

Not downloaded (junk / duplicate): panel daily diffs, `images/` (~1.9 GB), `var/cache`, Adminer `__sql.php`, a second SQL from inside the tar. Docroot still has public `__sql.php` (Adminer) and un-renamed `admin.php`.

## Where secrets and the full inventory live

Outside git (`0600`):

- Credentials letter: `/Users/leonidmbp/Documents/woodright-legacy-private-export/operator-access/legacy-cscart-operator-credentials.md`
- Panel inventory 2026-09-18: `/Users/leonidmbp/Documents/woodright-legacy-private-export/operator-access/legacy-cscart-isp-inventory-2026-09-18.md`

## Do not

- Commit panel / FTP / SSH / MySQL passwords, dumps, or certificate private keys
- Treat these as Medusa, Dokploy, or Timeweb credentials
- Change DNS or restore a backup onto the live host without an explicit owner instruction in the same message
- Point `woodright.ru` at the new stack from this document (cutover is a separate owner-authorized runbook)

## Related (no secrets)

- Buyer DNS / apex cutover: `docs/operator/public-apex-cutover.md`
- TTL plan: `docs/operator/dns-ttl-prechange-plan.md`
- Legacy content dump index: `docs/content-audit/SOURCE_INDEX.md`
- Commercial terms of the live CS-Cart pages are **legacy public**, not new-site SoT: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md`
