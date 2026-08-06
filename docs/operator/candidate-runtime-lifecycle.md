# Candidate runtime lifecycle

Candidates (temporary BE/SF on non-public ports) must be registered in:

`/srv/woodright/runtime-ownership/CANDIDATES.json`

Required fields: id, task, owner, ports, SHA, review_after, public_route, competing_with_live, cleanup_requires_owner_approval.

## Rules

- `public_route=true` is invalid for candidates
- Expiry of `review_after` means **audit**, not auto-stop
- Candidate `e34388f` is preserved unless the owning task explicitly approves cleanup
- Never delete worktrees/branches as part of expiry

Verifier: `node scripts/release/check-candidate-registry.cjs`
