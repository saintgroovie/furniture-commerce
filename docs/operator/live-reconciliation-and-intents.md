# Live reconciliation and release intents

- `ACTIVE_RELEASE` must match live containers/digests.
- Pending release intents live in `INTENTS.json`, not in `ACTIVE-RUNTIME-OWNER.txt`.
- External security cutovers are recorded as `reconciled_external_security_cutover` (not as agent deploy).
- Owner TXT is generated via `scripts/release/render-active-owner-txt.cjs`.
- Rollback keepers are never active identity.
