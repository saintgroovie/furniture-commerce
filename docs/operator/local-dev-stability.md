# Local Medusa / storefront / admin stability runbook

One-page recovery when catalog, product photos, or Admin UI look broken on local Woodright.

## Canonical ports

| Service | Port | Root |
|---------|------|------|
| Medusa + Admin | `:9000` | `/Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend` |
| Storefront | `:3002` | same repo `apps/storefront` |
| Experimental admin backend | `:9001` (+ Vite `:5174`) | secondary worktree / `yarn dev:admin-local` only |

Secondary worktrees (product-copy, local-stability, admin-ux, …) must **not** start Medusa on `:9000` or Next on `:3002`.

## Profiles

| Profile | Command | Use for |
|---------|---------|---------|
| **develop** | `woodright-backend.sh start develop` | Active backend/Admin edits; Vite admin (`admin_mode=vite-dev`); default Finder/LaunchAgent when no build |
| **qa** (buyer-uptime) | after build: `restart qa` | Catalog / photos / cart smoke without chokidar; Admin only if build includes admin assets |
| Parallel Admin experiment | `yarn dev:admin-local` | `http://localhost:9001/app/login` only |

Open Admin as **`http://localhost:9000/app/login`** (prefer `localhost` over `127.0.0.1`).

### Buyer-uptime (`qa`) procedure

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend
yarn build
# Medusa v2 marker:
test -f dist/package.json
# Admin assets for medusa start (either path is OK):
test -f public/admin/index.html || test -f dist/public/admin/index.html
cd ../../
scripts/local-dev/woodright-backend.sh restart qa
scripts/local-dev/woodright-doctor.sh --backend-only
```

If `dist/package.json` is missing, entrypoint **falls back to develop** (keeps `:9000` from staying empty). Incomplete/stale qa build may leave Admin as `Cannot GET /app` while catalog API still works - do not claim Admin OK without `--admin-only`.

Note: Prefer `yarn build` from `apps/backend` (not bare `yarn medusa build`). Buyer-uptime marker is `dist/package.json`. Admin for `medusa start` should exist under `public/admin` and/or `dist/public/admin` (on trees that ship `scripts/link-admin-build.mjs`, `yarn build` may also link Admin there). Backend `tsconfig.json` excludes `src/scripts/**` and `**/*.test.ts` so operator/seed scripts do not block the server compile.

### develop notes

- Watcher ignores include `static/`, `tmp/`, `uploads/`, `src/scripts/`, top-level `scripts/`, `package.json`, `yarn.lock`.
- Changes under ignored paths need an **explicit restart** to take effect.
- Cold boot / child recreate can take ~1-2 minutes. `status: starting` means supervisor alive but buyer not ready.

## LaunchAgents

Scripts prefer LaunchAgent uptime. Interactive `start` backgrounds for convenience; it is **not** a substitute for LaunchAgent.

### Backend (`com.woodright.medusa-backend`)

Correct shape:
- `run-backend.sh` → `WOODRIGHT_START_FOREGROUND=1` → exec Medusa
- KeepAlive = `{ SuccessfulExit = false }`
- Default mode: `develop`. For buyer-uptime without watcher, set LaunchAgent env `WOODRIGHT_BACKEND_MODE=qa` after `yarn build`, then bootstrap.
- Intentional stop: `backend-9000.pause` + `stop` + `launchctl bootout`

```bash
scripts/local-dev/install-qa-dev-servers-wrappers.sh
cp scripts/local-dev/com.woodright.medusa-backend.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.woodright.medusa-backend 2>/dev/null || true
rm -f ~/.woodright/qa-dev-servers/backend-9000.pause
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.woodright.medusa-backend.plist
```

Bare `KeepAlive=true` on oneshot `start` caused a relaunch storm - do not restore that.

### Storefront (`com.woodright.storefront-qa`)

```bash
cp scripts/local-dev/com.woodright.storefront-qa.plist ~/Library/LaunchAgents/
# installer also copies run-storefront.sh
launchctl bootout gui/$(id -u)/com.woodright.storefront-qa 2>/dev/null || true
rm -f ~/.woodright/qa-dev-servers/storefront-3002.pause
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.woodright.storefront-qa.plist
launchctl print gui/$(id -u)/com.woodright.storefront-qa | head
```

KeepAlive = `{ SuccessfulExit = false }` (crash restarts; intentional exit stays down).

## Readiness honesty

| `status:` | Meaning |
|-----------|---------|
| `ready` | Owned LISTEN on `:9000` + `/health=200` - buyer-safe to claim |
| `starting` | Supervisor/state alive, but no healthy owned listener - wait / doctor / logs |
| `down` | Not running |

`launchctl … state = running` alone is **not** proof that catalog works.

Claim recovery only after the matching doctor gate:
- catalog/API: `woodright-doctor.sh --backend-only`
- admin: `--admin-only`
- full stack: full doctor

## Admin symptoms → cause

| Symptom | Likely cause |
|---------|----------------|
| `Cannot GET /app` | `medusa start` without admin build, or foreign process on `:9000` |
| White screen / stale chunk / `.medusa/vite/deps` 404 | Stale Vite cache - `yarn dev:reset` + hard refresh |
| Login spinner forever | Mixed `localhost` / `127.0.0.1` cookies, or mixed `:9000` / `:9001` tabs |
| HMR / flashing reloads | `ADMIN_VITE_HMR=1` or watcher restart race |
| Admin OK on `:9001`, storefront photos broken | Only alt backend is up - storefront still needs canonical `:9000` |

## Symptoms → cause (catalog)

| Symptom | Likely cause |
|---------|----------------|
| `/catalog` or `/kids/catalog` error | Medusa `:9000` down or mid-boot (`status: starting`) |
| `/product-static/...` → 500 while Next is up | Backend down / flapping, not missing files |
| Logs: `EADDRINUSE`, WebSocket port in use, repeated `Creating server` | Second Medusa or watcher restart race |

## Hardening notes

- Exclusive lock on start/stop/restart (`backend-<port>.lock`)
- State file with pid/mode/repo/lstart; reuse requires same mode + canonical repo identity
- Foreign listener on `:9000` → refuse stop/reuse (no blind `KILL`)
- Buyer copy must stay neutral (no `:9000` in storefront strings); use doctor for port diagnosis

## Recovery (operator-approved start/stop only)

1. Symptom: catalog error / «no photos» / Admin broken.
2. `scripts/local-dev/woodright-backend.sh status` (`ready` / `starting` / `down`).
3. If not `ready` or foreign/conflict → `stop` then `start develop` (Admin) or `start qa` (buyer smoke after build). Mode mismatch on healthy port requires `restart <mode>`.
4. Doctor gates as above.
5. Hard refresh Admin (`localhost:9000/app`) and storefront catalog pages.
6. Never start a second Medusa on `:9000`. Keep `:9001` for experiments only; do not mix browser sessions.

## Agent gate

- Catalog/photos: `woodright-doctor.sh --backend-only` must pass (Admin not required).
- Admin: `woodright-doctor.sh --admin-only` must pass.
- Full doctor requires Admin + storefront; use when claiming the whole local stack.
- Do not claim catalog fixed from `launchctl running` alone.

## Logs

`~/.woodright/qa-dev-servers/backend-9000.log` and `.err.log` - look for `EADDRINUSE`, `Gracefully shutting down`, `Port is already in use`, `- Creating server`.
