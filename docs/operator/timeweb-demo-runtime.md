# Timeweb demo runtime (live)

**Live public demo VM:** `200.169.188.39` (`woodright-demo.ru`, `www`, `api`).

Dokploy UI: SSH tunnel only. See `docs/operator/dokploy-ssh-tunnel-access.md`.

```sh
ssh -N -L 33000:127.0.0.1:3000 woodright-demo-vm
```

Then `http://127.0.0.1:33000`. Do not publish `:3000`.

## SSH key (operator Mac, not in git)

Private key **is not** in the repository. Do not commit it. Do not paste it into chat, docs, or screenshots.

| Item | Value |
|---|---|
| Live path (2026-09-17) | `/Users/leonidmbp/Desktop/woodright-demo-mac/woodright-demo-mac` |
| Stale path (do not use) | `/Users/leonidmbp/Downloads/woodright-demo-mac/woodright-demo-mac` (missing) |
| User on VM | `leonid` |
| Mode | `0600`, owner `leonidmbp` |
| `~/.ssh/config` aliases | `woodright-demo-vm` → `200.169.188.39` (Timeweb, live). Yandex alias removed 2026-09-18 after operator power-off. |

Expected `~/.ssh/config` fragment (key path only, no key material):

```sshconfig
Host woodright-demo-vm
  HostName 200.169.188.39
  User leonid
  IdentityFile /Users/leonidmbp/Desktop/woodright-demo-mac/woodright-demo-mac
  IdentitiesOnly yes
  IdentityAgent none
  StrictHostKeyChecking yes
```

```sh
ssh woodright-demo-vm 'hostname; hostname -I'
```

Do **not** keep `Host woodright-yandex-vm`. Operator powered off the Yandex VM on 2026-09-18 (SSH banner timeout; HTTPS SSL timeout on `89.169.188.29`). Keep the Desktop key: it is the live Timeweb identity.

## What runs here

One public demo pair: `woodright-staging-*` + Dokploy `v0.29.12` + Traefik.

Daily backup timer: `woodright-backup.timer` (02:17 UTC). Postgres container pin: `WOODRIGHT_PG_CONTAINER=woodright-staging-postgres` via `/usr/local/sbin/woodright-backup-run`.

Backup root: `/srv/woodright/backups/automated/` (root `0700`).

## Yandex Cloud evacuation (2026-09-17)

Former demo host `89.169.188.29` (Yandex Cloud `ru-central1-b`) ran three stacks. The dumps, runtime files, compose, and import listed below were copied **before** power-off. That is not the same as copying every path on the VM.

**2026-09-18:** operator powered the VM off, then on briefly for a live audit (~08:26 UTC). After that it is not a rollback host. Extra small files from that audit: Timeweb `evac-from-yc-20260917T184508Z/live-recheck-20260918T0826Z/`.

| Path | Contents |
|---|---|
| Timeweb `/srv/woodright/evac-from-yc-20260917T184508Z/` | Full evac bundle (dumps, runtime JSON, import, compose, ops) |
| Timeweb `/srv/woodright/backups/evac-from-yc-20260917T184508Z/` | Postgres dumps only |
| Mac `/Users/leonidmbp/Documents/projects/woodright-backups/evac-yc-20260917T184508Z/postgres/` | Same dumps, second copy |

Dumps (custom-format `-Fc`), not restored onto live demo:

- `woodright_staging`
- `woodright_production` (candidate)
- `woodright_public_production`
- two July verify DBs
- Dokploy panel DB

Not copied (duplicates or recoverable): 23 GB media tarballs, `/srv/woodright/src` ops-install checkouts.

Do **not** restore these dumps onto live `woodright_staging` without a separate owner approval. Isolated rehearsal only (`docs/operator/backup-restore-runbook.md`).

Apex cutover helper still names the old Yandex A in `ops/release/cutover-public-apex-routing.sh` (`NEW_STACK_A`). That pair is **not** running on Timeweb. Do not retarget `woodright.ru` DNS until public_production is stood up here.

## Evacuation inventory (2026-09-18)

Second live SSH to Yandex `89.169.188.29` at 2026-09-18 ~08:26 UTC (uptime 1 min after operator power-on). Counts matched the 2026-09-17 dumps. Extra small files were copied to Timeweb `.../live-recheck-20260918T0826Z/`. This is **not** a Yandex Cloud console audit (snapshots / Object Storage / other VMs were never listed).

Shop-necessary data is on Timeweb (live demo + dumps + media volume). Full preservation of every byte on the old VM is **not** claimed.

| Asset | Needed to keep the shop / restore stacks | Copied? | Where |
|---|---|---|---|
| Live demo pair (staging SF/BE/PG/Redis + 513M media) | yes | yes | Timeweb containers + volume |
| `woodright_staging` dump | yes | yes | Timeweb evac + Mac dumps + Timeweb daily backup |
| `woodright_production` dump (candidate: 254 products / 2 orders / 11 carts) | yes | yes | Timeweb + Mac; live recheck matched |
| `woodright_public_production` dump (254 / 0 / 1) | yes | yes | Timeweb + Mac; live recheck matched |
| verify DBs `ambrepair` / `dimrepair` 2026-07-24 | historical | yes | Timeweb + Mac |
| Dokploy panel DB | yes | yes | Timeweb + Mac |
| runtime-identity + runtime-ownership (incl. env pins) | yes | yes | Timeweb evac + live `/srv/woodright/runtime-*` |
| compose: staging + production + public-production | yes | yes | Timeweb evac `compose/` |
| import (390M) | yes, not in git | yes | Timeweb evac |
| Daily postgres dumps already on Yandex disk (~41M, 48 files) | useful | yes | Timeweb evac `automated-postgres/` |
| Live staging media (513M; same size on all three stacks) | yes | yes | Timeweb volume + daily media tar 466M |
| `/srv/woodright/app/*.env` (3 files, July 16) | secrets, not in git | yes, 2026-09-18 live recheck | Timeweb `live-recheck-20260918T0826Z/app-env/` |
| `/home/leonid/woodright-backups` (6.9M PRE/POST dumps) | historical | yes, 2026-09-18 | Timeweb `live-recheck-.../home-woodright-backups/` |
| wr-adopt-live-recovery + p0 iptables rules | ops notes | yes, 2026-09-18 | Timeweb live-recheck dir |
| 23 GB Yandex media tarball history | no (same 513M tree) | no | skipped |
| `/srv/woodright/src` 1.3G + `/home/leonid/src-checkouts` | no | no | git |
| `/srv/woodright/app` git trees (~220M, SHAs `07fb2e0` / `18fd465`) | no | no | git |
| `/home/leonid/woodright-p0-backups/20260720T233628Z` (344M) | already on Mac | no extra copy | Mac `Documents/projects/woodright-backups/p0-20260720T233628Z` |
| `/srv/woodright/reports` ~56M | July ops logs | no | not buyer data |
| Yandex Cloud disk snapshots / Object Storage | unknown | **not verified** | console only |

Live recheck 2026-09-18: staging 255/2/40, candidate 254/2/11, public 254/0/1; media 513M × 3. All 6 dump sha256 OK on Timeweb and Mac. Live demo HTTPS 200. Do not restore dumps onto live `woodright_staging` without a new owner approval.

