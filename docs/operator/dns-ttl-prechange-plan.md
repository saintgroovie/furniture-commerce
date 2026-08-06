# DNS TTL pre-change plan (NOT authorized in this cycle)

## Current (read-only snapshot from readiness audit)

- A `woodright.ru` → `79.133.175.43` TTL **3600**
- A `www.woodright.ru` → `79.133.175.43` TTL **3600**
- `api.woodright.ru` — no A record yet
- MX/TXT/NS — must preserve

## Future owner request (separate from cutover)

Lower **only** web A TTLs:

| Record | Type | Current value | Proposed TTL | Rollback value |
|--------|------|---------------|--------------|----------------|
| woodright.ru | A | 79.133.175.43 | 300 | restore TTL 3600 (value unchanged until cutover) |
| www.woodright.ru | A | 79.133.175.43 | 300 | restore TTL 3600 |
| api.woodright.ru | A | (create at cutover) | 300 at create | delete record |

Timing: at least one full current TTL (3600s) before DNS cutover.

Do **not** change TTL in the same change set as final A retarget under the strict gate.

Nameservers: ns1/ns2.itb-host.ru — edits in ITB panel, not Dokploy.
