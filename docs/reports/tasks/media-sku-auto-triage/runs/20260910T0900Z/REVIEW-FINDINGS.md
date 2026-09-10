# Fable 5.1 review - media auto-triage (2026-09-10)

Independent read-only review. No Medusa write.

## Gates

| Field | Value |
|-------|--------|
| Codex reviewer status (Fable) | `request-changes` |
| Export commit (after must-do) | `needs_fixes` then draft-only |
| Production Medusa apply | `unsafe_scope` |
| Local `:9000` apply | no |

## Ship without operator (apply)

Empty. Exact hash-dups / processed copies / PDF extracts are inventory noise, not Medusa mutations.

Runtime near-dup collapse is already on `origin/main` (`media-near-dup-collapse.json`). Prod storefront live status not verified here.

## P0

- `surplus_angle_or_dup_family` keeps `i1` (often a hi-res copy of `_main`) and drops `i2`/`gallery_01` (the real second angle). 56+ SKU likely lose a live shot.
- Provence `pv-05-2` / `pv-06-2`: white finish photos dropped as surplus.

## P1

- Hero = detail crop: `ol-05-1`, `ol-69-1`
- `ol-25-1` kept a line-drawing; front photo dropped
- Runtime evidence conflict: `pv-02-1`, `pv-09-1`, `pv-23-1`, `pv-65-5`, `pv-65-8`
- `ol-05-н`: photos exist; handle/data, not a photo choice

## CLP

`co-02-1` cream 3-shot matches operator gold minus PDF catalog lifestyle. Stripping `Country_p*` watercolor/landscape is correct as product media; removing operator-assigned lifestyle still needs owner OK before touching applied CLP.

## Must-do closed in this run

Draft marker, ol-84-1 hygiene, drop ledger, this findings file. Content P0 not “fixed” into a new apply-ready gallery - that would be a new algorithm, not a silent ship.
