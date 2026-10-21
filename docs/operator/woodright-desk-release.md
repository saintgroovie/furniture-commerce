# Woodright OS desk: production promotion

The owner authorized real database saves on 2026-10-21 and explicitly deferred 1С and MANGO until access is available. This packet covers native Medusa contacts/requests, reminders, staff-only attachments and history. It does not authorize catalog rewrites, payment facts, outgoing messages/calls or public admin access.

## Artifact and database boundary

- Build a clean, CI-qualified main revision through `build-staging-images.yml`, profile `public_production`. Keep the immutable backend and storefront digests, workflow run, OCI revision and approval checksum together.
- Preserve the latest approved gallery/catalog changes in main. A local workspace build is not proof of a server rollout.
- Apply only `Migration20261020120000` through `apps/backend/scripts/desk-migration.cjs` inside the qualified backend artifact. Do **not** run global `medusa db:migrate` against production: the historical pending migration tail is outside this release.
- The runner refuses other database names, aliases, runtime roles, source revisions and partial desk schemas. The SQL migration independently refuses production without the targeted connection setting. Bookkeeping is committed by the framework in the same transaction. Repeating a completed run is a no-op.
- `Migration20261020123000` (MANGO) remains test-only and is not selected. Leave `WOODRIGHT_MANGO_ENABLED=0` and supply no telephony/accounting credentials.

## Ordered operator procedure

1. Recheck live containers, immutable digests, health identity, ACTIVE_OWNER, ACTIVE_RELEASE and the installed governance provenance. Freeze the expected current primary SHA, **each component's own OCI revision**, and both digests; abort on any drift rather than adopting new values mid-operation. A storefront-only release may legitimately retain an older backend. Pass its revision as `--expected-backend-source` to desk preparation; never label the retained backend with the storefront SHA. An aborted attempt needs a fresh baseline/recovery point and a new explicit packet.
2. Create and checksum a fresh `public_production` recovery point through the existing backup helper, with retention disabled for this release operation. Run the disposable restore rehearsal. Record successful recovery evidence before a database or container mutation.
3. Install the qualified governance/backup bundle through the existing governed mechanism. It must include `woodright-private-files-backup.sh` and `verify-private-files.py`; do not enable attachments while the backup path only archives public product media.
4. Record the owner's existing authorization in the canonical release approval using the existing compare-and-swap helper. Acquire the global `/srv/woodright/locks/live-cutover.lock` and the environment lease required by the installed pair cutover helper. Keep the global lease across migration/cutover/rollback, and preserve the foreground mutation journal if SSH is lost. No ad hoc Docker replacement or root metadata rewrite.
5. Prepare only the reviewed desk environment/volume delta with `prepare-private-desk-runtime.py`: bind its exact compose/approval checksums, expected current pair/source and fresh recovery manifest. Its default is a read-only plan; `--apply` acquires both leases and backs up the previous compose. It does not change image pins, secrets, containers, routing or active-release records. Then run the immutable migration artifact on the production private network with the orchestrator-managed database configuration. Never print/extract credentials into a chat, source, shell argument or evidence file. Run the same qualified artifact in plan mode first:

   ```sh
   node /server/scripts/desk-migration.cjs
   ```

   The governed execution supplies `WOODRIGHT_RUNTIME_ROLE=public_production`, `WOODRIGHT_DATABASE_IDENTITY_ALIAS=public_production_db`, `WOODRIGHT_BACKEND_SOURCE_SHA=<qualified SHA>`, `WOODRIGHT_DESK_SCHEMA_RELEASE=desk-v1-20261021`, and the existing secret `DATABASE_URL`. The only apply command inside that already-pinned artifact is:

   ```sh
   node /server/scripts/desk-migration.cjs --apply --source <qualified SHA>
   ```

   Check the emitted result, four desk tables and exact migration bookkeeping; leave all other migration rows unchanged. A partial schema must be reviewed, never automatically dropped.
6. Promote the qualified pair with the installed cutover helper and its exact approval checksum. Use the reviewed compose change: `WOODRIGHT_DESK_FEATURES=1`, private volume `woodright-public-production_woodright_private_files` at `/var/lib/woodright/private-files`, MANGO off. The image initializes the private volume root as UID 10001, mode 0700. This directory is outside all public static paths; individual immutable blobs are 0600.
7. Verify staff-only `/admin/woodright/desk/capabilities` reports the installed contract and real capabilities. Anonymous and customer/API-key document requests must fail. Only then restart the private workspace with `WOODRIGHT_LIVE_WRITES=1` and its exact new expected backend revision. A changed health revision is never auto-adopted.
8. Verify native login, create/edit contact, create/edit request, concurrent editor conflict, reminder completion/reopen, private upload/download, file index and history. Verify a reload preserves saved data. Use clearly identified operational verification records; never import prototype fixtures or invent customer/payment facts.
9. Take a post-release recovery point and run its restore rehearsal. The new helper verifies every restored attachment's byte size and SHA-256 against the private archive, including soft-removed attachments. New immutable blobs are written before SQL commit, so the later archive covers references in the earlier database dump. Physical purge is unsupported and must remain off.
10. Complete the release's public buyer verification and runtime identity checks before writing active-release success. Verify the required five public scenarios and preserve current gallery/pricing/catalog facts. Record actual rollout status separately from candidate checks.

## Rollback

Before first staff writes, restore the previous approved immutable pair and feature flags through the same governance lease and CAS. The additive desk tables can remain in place; automatic `down()` is deliberately refused.

After staff writes, disable workspace writes first, preserve a fresh recovery point and private archive, and use a reviewed forward repair. Restoring the old database without preserving new customer work is not an automatic rollback. Never delete blobs, receipts or action history to make a rollback look clean.

## Access boundary

Production approval/active-release files are root-owned and read-only to `leonid`. Use the authorized, noninteractive production release controller for this owner-approved rollout; keep local Mac settings and services untouched. If that controller is unavailable, report the missing execution path. Never work around it with the Docker socket, directory replacement or permission changes.
