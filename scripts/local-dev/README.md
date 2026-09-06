# Local-dev stability scripts

Single-instance control for Woodright Medusa on `:9000` and storefront on `:3002`.

## Profiles

| Profile | Command | When |
|--------|---------|------|
| **develop** | `./woodright-backend.sh start develop` | Backend/Admin edits; default when no build |
| **qa** (buyer-uptime) | after `yarn build`: `./woodright-backend.sh restart qa` | Catalog/cart/photos smoke without watcher flaps; needs `dist/package.json` (Medusa v2); if build missing → fallback to develop |
| **storefront develop** | `./woodright-storefront.sh start develop` | Next HMR; first route hits may take 15–30s |
| **storefront qa** | after `cd apps/storefront && yarn build`: `./woodright-storefront.sh restart qa` | `next start` from `.next-build` - no mid-compile pauses; LaunchAgent defaults to qa |

`status` labels: `ready` | `starting` | `down` (`starting` = supervisor alive, buyer not ready).

## Commands

```bash
./woodright-backend.sh status|stop|start qa|start develop|restart …
./woodright-storefront.sh status|stop|start qa|start develop|restart …
./woodright-doctor.sh [--backend-only|--admin-only]
./woodright-backend-scenarios.sh
```

Gates: catalog → `--backend-only`; Admin → `--admin-only`. Never claim catalog OK from `launchctl running` alone.

## Watch patch durability

- `apps/backend/scripts/patch-medusa-develop-watch.mjs` via postinstall
- Entrypoint also runs patch before `start develop`
- Ignores include `scripts/`, `package.json`, `yarn.lock` (changes there need explicit restart)
- `status` shows `watch:`; `WOODRIGHT_WATCH_PATCH_REQUIRED=1` fails closed

## Storefront copy

Buyer loadError is neutral (no `:9000`). Ops diagnosis stays in doctor/logs.

## Install / LaunchAgents

```bash
./install-qa-dev-servers-wrappers.sh
cp ./com.woodright.medusa-backend.plist ~/Library/LaunchAgents/
cp ./com.woodright.storefront-qa.plist ~/Library/LaunchAgents/
# bootout old labels, then bootstrap (see docs/operator/local-dev-stability.md)
```

KeepAlive for both: `{ SuccessfulExit = false }` on long-running `exec` runners.

## Runbook

`docs/operator/local-dev-stability.md`
