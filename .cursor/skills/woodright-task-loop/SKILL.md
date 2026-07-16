---
name: woodright-task-loop
description: >-
  Universal Woodright Codex↔Agent task LOOP for any workstream. Use when the
  owner says луп, луп до пуша, луп: fix, луп: verify, continue until exhausted,
  residual plan, по схеме (кодекс / правки / регейт), or repeats the long
  commit-Codex-fix ritual. Replaces copy-paste mega-prompts with short
  triggers; domain packs (pricing/media/…) plug in via types.md.
---

# Woodright task LOOP (universal)

Короткий trigger owner → полный цикл **scope → do/fix → gates → evidence → Codex → re-gate → FORMAT A → (optional) commit/push**, пока задача не исчерпана или `BLOCKED`.

Domain skills (`material-execution-pricing-loop`, `media-photo-verify-loops`, …) - **packs**, не отдельные вселенные. Читать [types.md](types.md).

Canonical repo: `/Users/leonidmbp/Documents/projects/furniture-commerce` (thin mirror не SoT).

## Короткие триггеры

| Trigger | Mode | Commit intent |
|---------|------|---------------|
| `луп` | full until exhausted | no commit unless already authorized in same message |
| `луп до пуша` | full until exhausted | commit + push under Codex when gate allows |
| `луп: fix` | Codex → fix → re-gate only | no (unless «до пуша» / explicit) |
| `луп: verify` | gates + evidence + Codex only | no |
| `луп: type=<pack>` | full, force type pack | as above if combined (`луп до пуша: type=backend`) |

Синонимы (тоже читать этот skill): «по схеме», «кодекс / дебаты / правки / регейт», «не останавливайся пока не исчерпано», «continue until exhausted», «residual».

Если trigger короткий, **не** ждать повторной портянки про FORMAT A / pathspecs / foreground / no `git add -A` - это уже здесь и в alwaysApply rules.

## Жёсткие правила (не ослаблять)

1. Precedence (same as `woodright-core.mdc`, do not fork):
   - Explicit owner instruction (including output schema) wins over workflow/FORMAT defaults
   - **Cannot** override: security / secrets / data-safety / git hard bans
   - Then: architecture invariants → task-specific packs → this loop defaults → human docs
   - `woodright-core.mdc` + alwaysApply companions = **canonical machine policy** (not «human docs»)
2. Foreground only; no autostart `yarn/medusa dev`; probe ports; restart только с явным named target
3. No prod DB / seed / apply / media-apply without explicit approval
4. Stage **pathspecs only**; never `git add -A` / `git add .`; dirty-file → hunk/path isolation
5. Do not touch unrelated dirty worktree
6. Codex when **required** by core table OR owner asked for Codex in the loop; if required and not run → Task status не commit-ready `done`
7. Commit/push only when trigger/owner authorizes **and** (if Codex required) gate `safe_to_commit`
8. RU dash ` - `; final handoff = FORMAT A (unless owner schema)

## Алгоритм (T0–T11)

```text
T0  Intent parse     trigger → mode (full|fix|verify) + type pack + commit intent
T1  Scope lock       pathspecs, out-of-scope, dirty isolation → scope.md
T2  Type pack        load types.md row; if domain skill exists → read it
T3  Baseline         SHA/branch/ports → docs/reports/tasks/<slug>/runs/<UTC>/baseline.md
T4  Do / Fix         implement or close must-do (in-scope only); append fix-log.md
T5  Gates            type-default gates (see types.md); record exit codes
T6  Evidence         test-results.md + evidence/ (logs, screenshots, JSON)
T7  Codex            [codex-prompt.md](codex-prompt.md) → codex-review.md
                     require: reviewer status + commit gate + must-do[]
T8  Branch           if must-do / fail gates / P0–P1 (or P2 if owner «всё») → T4
T9  Exhaust          checklist below all true OR honest BLOCKED
T10 Handoff          FORMAT A (or owner schema + honesty disclosures)
T11 Git              only if commit intent; pathspecs; push if «до пуша»
```

### Stop / BLOCKED

**Exhausted when:** gates green; Codex `must-do: []` (if Codex ran/required); no open P0/P1 (and P2 if owner demanded full close); FORMAT A honest.

**BLOCKED when:** ports down without permission to restart; missing credential; product decision needed; Codex `unsafe_scope`; background prompt interrupt (`foreground-only-execution.mdc`).

## Артефакты

```text
docs/reports/tasks/<task-slug>/
  latest.md
  runs/<UTC>/
    baseline.md
    scope.md
    test-results.md
    codex-review.md
    fix-log.md
    evidence/          # optional screenshots, JSON, curl excerpts
```

`<task-slug>`: короткий kebab из workstream (`material-pricing`, `nav-order`, `rules-loop`, …).  
Если domain pack уже пишет в свой каталог (например `docs/reports/material-execution-pricing/`) - **не дублировать**: указать путь в `latest.md` и `scope.md`, один SoT на run.

## Минимальный Codex contract

Каждый Codex вызов в лупе должен вернуть:

1. `Codex reviewer status`: approve | approve-with-notes | request-changes  
2. `Codex commit gate`: safe_to_commit | needs_fixes | unsafe_scope (или `n/a` если verify-only без commit)  
3. `must-do`: JSON array (empty if exhausted)  
4. Findings P0–P3 (or empty)  
5. Allowed pathspecs for commit (if gate allows)

Сохранять verbatim-ish в `codex-review.md` (не оставлять `_pending_` на зелёном exhausted run).

## Связь с domain packs

| Pack | Skill / runner |
|------|----------------|
| `pricing` | `.cursor/skills/material-execution-pricing-loop/` + `scripts/material-execution-pricing-loop.sh` |
| `media` | `.cursor/skills/media-photo-verify-loops/` |
| others | [types.md](types.md) |

## Примеры

```text
луп
луп до пуша
луп: fix
луп: verify
луп: type=backend
луп до пуша: type=pricing
```
