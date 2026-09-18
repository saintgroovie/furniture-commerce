# Yandex / Timeweb closeout 2026-09-18 09:45 UTC

Read-only Timeweb + repo hardening. Yandex Cloud control plane was **not** reachable.

## Timeweb runtime

- host `woodright-demo` IP `200.169.188.39` uptime ~20h
- staging SF/BE/PG/Redis Docker `healthy`; Dokploy + Traefik up
- `https://woodright-demo.ru/` 200; CSS 200 (`f97c92c35480c84f.css`)
- paths `/` `/catalog` `/rooms` `/kids` `/about` `/contacts` 200
- `https://api.woodright-demo.ru/health` 200
- no `89.169.188.29` in live Traefik/systemd/Dokploy config (helper + identity scripts only, git copies)

## Recovery

- timer `woodright-backup.timer` enabled/active; last Result=success 2026-09-18 02:32:07–02:32:36 UTC exit 0
- next 2026-09-19 02:28:56 UTC
- manifest `/srv/woodright/backups/automated/manifests/recovery-point-20260918T023207Z.json` status=success
- postgres dump 798602 sha256 `6b05f52754efd50213cc3e4e3097c6775924a3e4c0f7acbf15fd19fba65fa97c` matches manifest; `pg_restore --list` TOC 1076, TABLE DATA 158; dbname `woodright_staging`; dump from PG 15.19; isolated `postgres:16-alpine --network none` (no live restore)
- media tar.gz 488334206 sha256 `cf9291ef635db49dc887ce76cd661cc3efd4e127ffbdb19a32434434eaa9b4c3` gzip -t OK; 6863 list entries
- pin `WOODRIGHT_PG_CONTAINER=woodright-staging-postgres`

## Evacuation (already on Timeweb)

- `/srv/woodright/evac-from-yc-20260917T184508Z/` ~468M
- six postgres dumps sha256 OK vs sidecars
- Mac `Documents/projects/woodright-backups/evac-yc-20260917T184508Z/postgres/` six dumps sha256 match sidecars
- live-recheck 20260918T0826Z: app-env, home backups 6.9M, iptables, wr-adopt 3.9M
- 23G historical media tars not copied: live volume + daily tar (517M uncompressed / 488M gz, 6835–6863 files) is the recovery source. Tars were extra history of the same tree (live recheck 2026-09-18: media volumes 513M × 3).
- ops logs 56M not copied (not buyer data)

## Yandex control plane

- `yc` CLI absent; `~/.config/yandex-cloud` absent; no `YC_*` env
- browser `console.yandex.cloud` → login wall (`auth.yandex.cloud/login`), no session
- VM `89.169.188.29` TCP 22/443 SYN-ACK; SSH banner empty/timeout; not a live runtime
- snapshots / images / Object Storage / other VMs / billing **unverified**

## DNS (read-only)

- demo `woodright-demo.ru` / `www` / `api` → `200.169.188.39`
- apex `woodright.ru` / `www.woodright.ru` → `79.133.175.43`
- `api.woodright.ru` empty
- no DNS mutation

## Repo hardening (this run)

- `ops/release/cutover-public-apex-routing.sh`: no hardcoded `NEW_STACK_A`; require `--new-stack-a` / `WOODRIGHT_PUBLIC_APEX_NEW_STACK_A`; refuse `89.169.188.29`, `200.169.188.39`, `79.133.175.43`
