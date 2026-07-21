# Runtime ownership

## Active controller

Staging/demo buyer runtime is owned by **Dokploy + `manual_flock_deploy`**.

Disabled competitors (do not re-enable casually):

- HTTPS Nightly storefront replace
- Cursor Nightly HTTPS agent
- ad-hoc `wr-restore-https-task`

Host publish of `3000` / `3002` / `9000` on the VM is forbidden for competing stacks.

## Owner files

Machine-readable:

`/srv/woodright/runtime-ownership/ACTIVE_OWNER.json`

Human-readable summary (must agree):

`/srv/woodright/locks/ACTIVE-RUNTIME-OWNER.txt`

Deploy lock:

`/srv/woodright/runtime-ownership/DEPLOY.lock` (flock)

Verifier:

```bash
node scripts/release/check-owner-state.cjs \
  --json /path/ACTIVE_OWNER.json \
  --txt /path/ACTIVE-RUNTIME-OWNER.txt
```

Disagreement **blocks** cutover.

## Single owner rule

Do not manage the same `woodright-staging-backend` / `woodright-staging-storefront` pair from Compose, systemd, cron, Nightly, LaunchAgent, and Dokploy at once.
