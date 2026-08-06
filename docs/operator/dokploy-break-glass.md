# Dokploy control plane (live)

## Current honest verdict

`sole_owner_with_known_ui_bypass`

- Dokploy is the routine mutation owner
- Direct UI redeploy/restart can still bypass flock/lease
- `claim_bypass_closed` must stay `false` until a safe negative UI test exists
- Do not delete the only admin to manufacture closure

## Break-glass

- SSH host access for `leonid`
- ACTIVE_RELEASE / ACTIVE_OWNER backups under `/srv/woodright/backups/active-release/`
- Never store passwords/tokens in Git or policy JSON
- Recovery must remain after any role tightening

## Machine policy

`/srv/woodright/runtime-ownership/policies/live-control-plane.json`

Validator: `scripts/release/validate-dokploy-enforcement.cjs`

## Auto-deploy

Build/merge must not become live deploy without a release transaction (rule 84).
Re-verify Dokploy triggers periodically; absence of grep hits is not forever-proof.
