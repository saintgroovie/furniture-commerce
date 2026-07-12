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

| Goal | Command | Admin UI |
|------|---------|----------|
| Catalog / photos smoke | `woodright-backend.sh start qa` | Built admin after full build; incomplete build may show `Cannot GET /app` |
| Admin UI / backend edits | `woodright-backend.sh start develop` | Vite admin (`admin_mode=vite-dev`); default `ADMIN_VITE_HMR=0` |
| Parallel Admin experiment | `yarn dev:admin-local` | `http://localhost:9001/app/login` only |

Open Admin as **`http://localhost:9000/app/login`** (prefer `localhost` over `127.0.0.1`).

## Preferred QA profile (storefront)

After `yarn medusa build` in `apps/backend`:

```bash
scripts/local-dev/woodright-backend.sh start qa
```

For Admin UI stability work, use `start develop` (single instance). Do not run a second Medusa on `:9000`.

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
| `/catalog` or `/kids/catalog` error | Medusa `:9000` down or multiple fighting listeners |
| `/product-static/...` → 500 while Next is up | Backend down / flapping, not missing files |
| Logs: `EADDRINUSE`, WebSocket port in use, repeated `Creating server` | Second Medusa or watcher restart race |

## Hardening notes

- Exclusive lock on start/stop/restart (`backend-<port>.lock`)
- State file with pid/mode/repo/lstart; reuse requires same mode + canonical repo identity
- Foreign listener on `:9000` → refuse stop/reuse (no blind `KILL`)
- Buyer copy must stay neutral (no `:9000` in storefront strings); use doctor for port diagnosis

## Recovery (operator-approved start/stop only)

1. Symptom: catalog error / «no photos» / Admin broken.
2. `scripts/local-dev/woodright-backend.sh status` (shows mode, watch_patch, admin, state identity).
3. If health ≠ 200 or foreign/conflict → `stop` then `start develop` (Admin) or `start qa` (catalog smoke). Mode mismatch on healthy port requires `restart <mode>`.
4. Doctor:
   - catalog/API: `scripts/local-dev/woodright-doctor.sh --backend-only`
   - admin: `scripts/local-dev/woodright-doctor.sh --admin-only`
   - full stack: `scripts/local-dev/woodright-doctor.sh`
5. Hard refresh Admin (`localhost:9000/app`) and storefront catalog pages.
6. Never start a second Medusa on `:9000`. Keep `:9001` for experiments only; do not mix browser sessions.

## Agent gate

- Catalog/photos: `woodright-doctor.sh --backend-only` must pass (Admin not required).
- Admin: `woodright-doctor.sh --admin-only` must pass.
- Full doctor requires Admin + storefront; use when claiming the whole local stack.

## Watch ignores (develop)

- Admin Vite: `apps/backend/medusa-config.ts` ignores `static/`, `tmp/`, `uploads/`, …
- Medusa chokidar: `scripts/local-dev/patch-medusa-develop-watch.mjs` runs before `start develop`.

## Logs

`~/.woodright/qa-dev-servers/backend-9000.log` and `.err.log` - look for `EADDRINUSE`, `Gracefully shutting down`, `Port is already in use`.
