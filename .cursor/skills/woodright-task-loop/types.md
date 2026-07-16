# Type packs - woodright-task-loop

Выбирать pack по trigger `type=` или по diff/intent. Один pack за цикл (можно отметить secondary).

## Pack matrix

| type | Когда | Default gates | Codex | Domain skill |
|------|-------|---------------|-------|--------------|
| `generic` | неясно / mixed small | scoped diff review; smoke only if runtime touched | per core table | - |
| `storefront` | PDP/cart/UI/CSS/copy | storefront lint or tsc if cheap; browser smoke on :3002 if UI | recommended medium; required if cart/pricing/a11y-critical | `ru-ux-ui-copywriting` when RU UI copy |
| `backend` | routes, modules, workflows | unit/tests if present; `yarn build` when dist-served; :9000 smoke | required if business logic / cart / DB | - |
| `pricing` | material tiers, finish premium, configured unit_price | run pricing loop script / unit+E2E | required | `material-execution-pricing-loop` |
| `media` | gallery, near-dup, Media Ops verify | `yarn verify:media-gallery` (± live) | required before «verified» | `media-photo-verify-loops` |
| `rules` | `.cursor/rules`, skills governance | file review only; no port dependency | **required** | - |
| `docs` | docs-only, reports | link/path sanity | not required unless governance/security | - |

## Codex core table (do not fork)

Canonical: `.cursor/rules/woodright-core.mdc` - Required / Recommended / Not required.  
This pack matrix **adds** defaults; it never weakens Required.

## Gate notes

### storefront
- Prefer existing servers (`curl`/`lsof` :3002). No autostart.
- RU copy → read `.cursor/skills/ru-ux-ui-copywriting/`.
- Avoid full `next build` unless regression risk is high; prefer targeted checks + browser smoke.

### backend
- QA mode serves `dist/` - after route/lib changes: rebuild + restart only with owner permission on LaunchAgent/PID.
- Prefer focused `node --import tsx --test` / existing unit files over whole-repo tsc (admin noise).

### pricing
- Prefer: `bash scripts/material-execution-pricing-loop.sh`
- Artifacts already under `docs/reports/material-execution-pricing/` - do not copy into `docs/reports/tasks/` unless owner asks; link from task `latest.md`.

### media
- Follow media skill LOOPs 0–6; Codex via its `codex-prompt.md`.
- No media-apply / DB write without explicit approval.

### rules
- Edit rules **only** in canonical root.
- After change: Codex review before claim done; mirror sync is separate.

### docs
- No runtime required. Keep diffs small; no unrelated rule rewrites.

## Inferring type from pathspecs (heuristic)

| Paths touched | Likely type |
|---------------|-------------|
| `apps/storefront/src/**` UI without pricing contracts | `storefront` |
| `apps/backend/src/api/**`, `modules/**`, `workflows/**` | `backend` |
| `material-tier*`, `finish-color*`, `configured-line-item*`, cart line-items route | `pricing` |
| media gallery scripts / near-dup / Media Ops | `media` |
| `.cursor/rules/**`, `.cursor/skills/**` | `rules` |
| `docs/**` only | `docs` |
