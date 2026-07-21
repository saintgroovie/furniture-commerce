# Rollback

## Principle

Capture rollback **before** cutover. Never invent keepers after a failed deploy.

## Recorded fields

- previous backend/storefront digests
- keeper container names
- backup directory
- `COMMANDS.md` with rename/start sequence under `DEPLOY.lock`

Example (5683afa cutover):

`/srv/woodright/backups/pre-5683afa-cutover-20260721T130125Z/COMMANDS.md`

## Rules

- Redeploy **previous exact digests** (or start keepers), not `latest`.
- Do not `docker system prune` or delete failed release images during the rollback window.
- After rollback: health + public smoke; do not immediately re-attempt without a root cause.
- Prefer Dokploy/`manual_flock_deploy` naming contract over ad-hoc `docker run`.
