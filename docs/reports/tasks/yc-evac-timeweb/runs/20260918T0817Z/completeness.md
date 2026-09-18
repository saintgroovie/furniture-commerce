# Live recheck 2026-09-18 08:26 UTC

Yandex VM powered on briefly. SSH OK, uptime 1 minute.

## Counts (matched 2026-09-17 dumps)

- staging 255 / 2 / 40
- production-candidate 254 / 2 / 11
- public-production 254 / 0 / 1
- media volumes 513M × 3

## `/srv/woodright/app` 220M

Git checkouts `furniture-commerce-07fb2e0…` and `…18fd465…` (July). Unique extras: three `.env` files, copied to Timeweb `live-recheck-20260918T0826Z/app-env/`.

## Also copied (11M)

- `/home/leonid/woodright-backups` 6.9M
- `wr-adopt-live-recovery-20260803T075941Z` 3.9M
- p0 iptables rules

## Not copied (not shop data)

- 23G media tars
- src / home git checkouts
- reports 56M (July ops logs)
- home P0 344M (already on Mac `p0-20260720T233628Z`)

## Still unverified

Yandex Cloud snapshots / Object Storage (`yc` CLI absent).
