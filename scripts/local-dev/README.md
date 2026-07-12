# Local-dev stability scripts

Single-instance control for Woodright Medusa on `:9000` and storefront on `:3002`.

## Profiles

| Profile | Command | When |
|--------|---------|------|
| **qa** (catalog/photos smoke) | `./woodright-backend.sh start qa` | After `medusa build`; no watcher |
| **develop** | `./woodright-backend.sh start develop` | Admin UI + backend edits |

Finder wrappers default to **qa**. Override: `WOODRIGHT_BACKEND_MODE=develop ./run-backend.sh`.

## Commands

```bash
./woodright-backend.sh status|stop|start qa|start develop|restart …
./woodright-storefront.sh status|stop|start|restart
./woodright-doctor.sh [--backend-only|--admin-only]
./woodright-backend-scenarios.sh
```

Gates: catalog → `--backend-only`; Admin → `--admin-only`.

## Watch patch durability

- `apps/backend/scripts/patch-medusa-develop-watch.mjs` via postinstall
- Entrypoint also runs patch before `start develop` (prefers backend scripts copy)
- `status` shows `watch:`; `WOODRIGHT_WATCH_PATCH_REQUIRED=1` fails closed

## Storefront copy

Buyer loadError is neutral (no `:9000`). Ops diagnosis stays in doctor/logs.

## Install

```bash
./install-qa-dev-servers-wrappers.sh
```

## Runbook

`docs/operator/local-dev-stability.md`
