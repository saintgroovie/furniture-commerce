# DNS rollback plan - Woodright public launch (2026-07-30)

Status: **planning document only**. No DNS mutation has been proposed to a
registrar/DNS provider and none is applied by this change. This worktree's
hard constraints explicitly forbid touching live DNS - this file documents
the human rollback shape so a future, separately approved cutover has a
plan to follow and revert if needed.

## Machine snapshot

Primary operational capture (outside git):

```
/tmp/woodright-dns-snapshot-20260730/dns-snapshot.json
```

Readiness gate companion (committed, non-secret dig answers + SPF warning):

```
docs/evidence/public-launch-20260730/dns-snapshot.json
```

Captured 2026-07-30 (MSK context): apex/www A `79.133.175.43` TTL 3600;
NS `ns1/ns2.itb-host.ru`; MX `10 mx.yandex.net` + `20 mail.woodright.ru`;
SPF `v=spf1 ip4:79.133.175.238 a mx ~all`; `api`/`admin` NXDOMAIN;
VM target `89.169.188.29` not yet in zone. **Not applied.**

## Records that must be preserved unchanged

Only web-facing records (`A`/`AAAA`/`CNAME` for `woodright.ru`,
`www.woodright.ru`, `api.woodright.ru`) are in scope for the public-launch
cutover. Everything else must be captured in the snapshot above and left
untouched:

- **MX** - mail routing must not change. Losing or altering MX records
  during a web cutover is a common, easily-avoidable outage - verify the
  snapshot captured MX before touching anything, and diff after.
- **TXT** - includes SPF and any other verification/ownership TXT records
  (domain verification for third-party tools, DKIM if present). Preserve
  verbatim.
- **NS** - nameserver delegation must not change as part of this cutover.
  If NS records ever need to move (registrar/DNS provider migration), that
  is a separate, much higher-risk change requiring its own plan - out of
  scope here.

## SPF `a` mechanism warning

If the domain's SPF TXT record uses the `a` mechanism (i.e. it authorizes
mail based on the domain's own `A`/`AAAA` record rather than a dedicated
`include:`/`ip4:`/`ip6:` entry), **changing the apex `A`/`AAAA` record for
the web cutover can silently change what SPF authorizes for mail** even
though no one touched the TXT record itself. Before cutover:

1. Read the current SPF TXT record from the snapshot.
2. If it contains `a` (or `a:woodright.ru` / bare `a`), flag this explicitly
   to the owner - the web cutover's new apex IP would become part of the
   mail SPF authorization by mail-server implication, or a passing web
   record change could silently break inbound mail deliverability
   verification with no `A`-based mail relay ever intended.
3. If confirmed, recommend converting the mechanism to an explicit
   `ip4:`/`ip6:`/`include:` entry that does not depend on the apex web
   record, as its own tiny, reviewable change, before the web cutover -
   not invented here, just flagged for the owner to decide.

## Proposed mutations (NOT applied)

The only mutations this plan anticipates are web-facing and are listed here
for review, not execution:

| Host | Proposed record | Notes |
|---|---|---|
| `woodright.ru` | `A`/`AAAA` -> Traefik entrypoint IP | matches `ops/config/public-launch/traefik-production.template.yml` |
| `www.woodright.ru` | `A`/`AAAA` (or `CNAME`) -> same target, 301 to apex at Traefik | see same template's `woodright-www-redirect` router |
| `api.woodright.ru` | `A`/`AAAA` -> same Traefik entrypoint IP (routed to backend by Host rule) | see same template's `woodright-api` router |

No demo host (`woodright-demo.ru`, `api.woodright-demo.ru`) record is part
of this plan.

## Rollback procedure (if cutover needs to be reversed)

1. Restore the exact pre-cutover values for `woodright.ru`,
   `www.woodright.ru`, `api.woodright.ru` from the snapshot at
   `/tmp/woodright-dns-snapshot-20260730/`.
2. Do not touch MX/TXT/NS during rollback - they should not have changed in
   the first place (see above).
3. Revert the Traefik dynamic config
   (`ops/config/public-launch/traefik-production.template.yml`) if it was
   applied, or disable its routers.
4. Confirm TLS certs for the reverted state are still valid, or let them
   expire naturally if the hosts are pointed away from Traefik.
5. Re-run DNS propagation checks before declaring rollback complete - DNS
   TTL means both cutover and rollback are not instantaneous.

## Execution gate (not part of this document)

Applying any of the mutations above requires explicit owner approval and a
separate, reviewed change - this plan does not authorize execution.
