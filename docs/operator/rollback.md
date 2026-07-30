# Rollback

## Principle

Capture rollback **before** cutover. Never invent keepers after a failed deploy.

## Recorded fields

- previous backend/storefront **digests** (authority)
- backup directory + checksums
- `COMMANDS.md` with digest-based restore under the canonical live mutation lock
- whether keeper containers actually exist (optional; often absent after compose recreate)

## Keeper containers vs image anchors

- **Keeper containers** are optional temporary rename holdbacks. They may be
  consumed by `docker compose ... --force-recreate`.
- **Image digest anchors** (local and/or GHCR) are the durable rollback target.
- Do not document production rollback as requiring keepers if they are not present.
- Do not use staging keeper names for production.

## Production-candidate (private)

See: [production-candidate-rollback.md](./production-candidate-rollback.md)

Phases: lock → quiesce writers → preserve failed state → restore DB (only if needed) →
verify schema/ledger → restore digests/pins → controlled resume → post-gate.

Never restore a backup over a live DB with active writers. Prefer disposable
`restore_rehearsal` targets for practice.

## Public demo

- Redeploy **previous exact digests**, not `latest`.
- Do not `docker system prune` or delete failed release images during the rollback window.
- After rollback: health + public smoke; do not immediately re-attempt without a root cause.
- Prefer Dokploy/`manual_flock_deploy` naming contract over ad-hoc `docker run`.
- Official pair cutover + keeper rollback: [public-demo-pair-cutover.md](./public-demo-pair-cutover.md)
  (`cutover-public-demo-pair.sh`, `rollback-staging-*-from-keeper.sh`).

## DNS / woodright.ru

Rollback of private production-candidate does **not** change DNS or `woodright.ru`.
Public launch remains a separate owner decision.
