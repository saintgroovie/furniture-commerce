---
name: material-execution-pricing-loop
description: >-
  Woodright Codex↔Agent loop for material-execution × finish premium pricing
  (PDP dropdown, cart unit_price, A1/B1). Use when continuing material tiers /
  исполнение / LDSP / solid_full / finish +5% / configured line-item pricing,
  when Codex returns request-changes or non-empty must-do, when unit/E2E fails,
  or when the owner says continue until exhausted / residual plan / pricing loop.
---

# Material execution pricing LOOP

Агентский playbook: **прогнать gates → сохранить evidence → Codex → правки → re-gate**, пока `must-do: []`.

## Когда читать

- Правки `material_tiers` / finish premium / PDP «Исполнение» / cart line-items pricing
- Codex `request-changes` или непустой `must-do`
- Падение unit/E2E pricing
- Owner: «продолжай по схеме», «until exhausted», residual plan

## Канон (пути)

| Артефакт | Путь |
|----------|------|
| Этот skill | `.cursor/skills/material-execution-pricing-loop/SKILL.md` |
| Codex prompt | [codex-prompt.md](codex-prompt.md) |
| Checklist | [checklist.md](checklist.md) |
| Runner (foreground) | `scripts/material-execution-pricing-loop.sh` |
| E2E script | `apps/storefront/scripts/e2e-material-execution-pricing.cjs` |
| Unit tests | `apps/backend/src/lib/configured-line-item-pricing.test.ts` |
| Pure resolver | `apps/backend/src/lib/configured-line-item-pricing.ts` |
| Cart route | `apps/backend/src/api/store/carts/[id]/line-items/route.ts` |
| Run artifacts | `docs/reports/material-execution-pricing/runs/<UTC>/` |
| Latest | `docs/reports/material-execution-pricing/latest.md` |

Canonical repo: `/Users/leonidmbp/Documents/projects/furniture-commerce` (thin mirror не SoT).

## Триггеры

1. Diff затрагивает material-tier / finish-premium / PDP material select / CTA cart metadata / configured line-item pricing
2. Codex verdict `request-changes` **или** `must-do` непустой
3. Unit или E2E pricing падают
4. Явная команда owner: continue until exhausted / residual / pricing loop

## Жёсткие правила

1. Foreground only - bounded commands; **не** autostart `yarn dev` / `medusa develop`
2. Probe `:9000` / `:3002`; если down → `BLOCKED` + точная start-команда; restart backend только с **явным** permission на LaunchAgent/PID
3. No prod DB / seed / apply без явного approval
4. `git add` только pathspecs; **запрещён** `git add -A` / `git add .`
5. Не трогать unrelated dirty worktree
6. Commit/push только после Codex `safe_to_commit` **и** явной команды owner (если owner уже сказал «коммит и пуш» / «пока не закончено» + схема с push - следовать)
7. Тире в RU: ` - `; FORMAT A на финальный handoff

## Алгоритм LOOP

```text
LOOP 0  Scope lock: list pathspecs; baseline SHA → runs/<UTC>/baseline.md
LOOP 1  bash scripts/material-execution-pricing-loop.sh
        (unit + API/browser E2E; artifacts in runs/<UTC>/)
LOOP 2  If exit≠0 → fix in-scope only → append fix-log.md → re-run LOOP 1
LOOP 3  Codex via codex-prompt.md (read-only MCP); save → runs/<UTC>/codex-review.md
LOOP 4  If must-do / P0–P2 → fix → fix-log.md → LOOP 1
LOOP 5  Repeat until Codex must-do: [] AND unit+E2E green
LOOP 6  FORMAT A: exhaustion checklist, evidence paths, Codex gate, git honesty
LOOP 7  Commit/push ONLY when owner/gate allows; stage exact pathspecs
```

### Команды

```sh
# Full foreground gate (needs :9000 + :3002 already up)
bash scripts/material-execution-pricing-loop.sh

# Unit only
bash scripts/material-execution-pricing-loop.sh --unit-only

# Backend unit directly
cd apps/backend && yarn node --import tsx --test src/lib/configured-line-item-pricing.test.ts

# E2E directly
ARTIFACT_DIR=docs/reports/material-execution-pricing/runs/manual/e2e \
  node apps/storefront/scripts/e2e-material-execution-pricing.cjs
```

### Stop conditions

- Unit + E2E exit 0
- Codex `must-do: []` и нет открытых P0/P1/P2 по pricing scope
- Последний fix прошёл полный re-gate
- Artifacts содержат SHA, команды, exit codes
- `BLOCKED` если нужен prod DB / credential / owner product decision

### Out of scope

- Catalog cards, media/gallery, SEO, unrelated storefront chrome
- New tiers / multiplier business-rule changes (нужен owner)
- Prod deploy / production DB backfill
