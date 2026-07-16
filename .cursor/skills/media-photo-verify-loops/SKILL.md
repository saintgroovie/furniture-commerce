---
name: media-photo-verify-loops
description: >-
  Woodright media gallery verify LOOPs: was→became photo audit, lost angles,
  remaining near-dups, live PDP smoke, Codex review. Use when checking product
  photos, gallery duplicates, missing angles, av-05-1/ol-84-1 controls, Media
  Ops aftermath, near-dup evidence, or when the user asks to verify/перебрать/
  сверить фото / пайплайн медиа / лупы галереи.
---

# Media photo verify LOOPs

**Parent:** universal [woodright-task-loop](../woodright-task-loop/SKILL.md) (`луп: type=media`). This skill is the **media pack**.

Агентский playbook: **сам перепроверить** фото каталога/PDP - не потерялись ли ракурсы, не остались ли дубли, сверить было/стало, отдать **Codex**.

## Когда читать

- Пользователь просит проверить фото / ракурсы / дубли на PDP или в каталоге
- После правок near-dup / gallery / Media Ops apply
- Контроли `av-05-1`, `ol-84-1` или «пропал ракурс / остался дубль»
- Нужен отчёт для Codex перед «verified»

## Канон

| Артефакт | Путь |
|----------|------|
| Verify playbook | `docs/storefront/MEDIA_GALLERY_VERIFY_PIPELINE.md` |
| Near-dup analysis | `docs/storefront/MEDIA_NEAR_DUP_ANALYSIS_PIPELINE.md` |
| Verify script | `apps/storefront/scripts/verify-product-media-gallery.ts` |
| Analyze script | `apps/storefront/scripts/analyze-product-media-near-dups.ts` |
| Codex prompt | [codex-prompt.md](codex-prompt.md) |
| Latest report | `docs/storefront/media-gallery-verify-latest.md` |
| Machine JSON | `apps/storefront/tmp/media-gallery-verify.json` |

Canonical repo root: `/Users/leonidmbp/Documents/projects/furniture-commerce` (thin mirror is not SoT).

## Жёсткие правила

1. Foreground only - bounded commands, no `yarn dev` autostart
2. No DB write / seed / media-apply without explicit approval
3. Collapse **only** from evidence JSON - never blind `iso`↔`iso-1`
4. P1 from verify → Task status не `done`
5. Codex **required** before claiming gallery verify complete (see core Codex table: media / high-blast / after P1-P2 close)

## Алгоритм агента (коротко)

```text
LOOP 0  Probe :9000 (and :3002 if --live)
LOOP 1  If static/evidence may be stale → yarn analyze:media-near-dups
LOOP 2  yarn verify:media-gallery [-- --live] [-- --handles …]
LOOP 3  Optional was/became: --write-baseline before change; --baseline after
LOOP 4  Read media-gallery-verify-latest.md + JSON counts/findings
LOOP 5  Codex via codex-prompt.md (read-only)
LOOP 6  FORMAT A: status, evidence, Codex gate, git honesty
```

### Команды

```sh
cd apps/storefront
yarn verify:media-gallery -- --live
# or scoped
yarn verify:media-gallery -- --handles av-05-1,ol-84-1 --live
```

### Интерпретация

| Finding | Действие |
|---------|----------|
| `lost_protected_angle` | P1 - restore/evidence broken (как av-05-1 class) |
| `remaining_evidence_dup` | P1 - drop не применился (как ol-84-1 class) |
| `suspicious_lost_angle` | P2 - buyer slot съел angle-like кадр; сверить evidence protect |
| `baseline_lost_*` | P1 - регресс vs сохранённый was |
| Single-image SKU (`to-62-1`) | Не «потеря» - в Medusa/static один файл |

## Контроли

- `av-05-1` / `prod_01KV69A7AKTR1KH8GH90KC8YAJ` - оба iso
- `ol-84-1` / `prod_01KNTBXADX1KA6WGTERRHPPEV7` - без `gallery_01` в effective/live media

## Codex

После verify без P1 (или с честным списком P1): вызвать MCP `user-codex-woodright-reviewer` / `codex` с телом из [codex-prompt.md](codex-prompt.md).  
В ответе оператору: **Codex reviewer status** + **Codex commit gate** отдельными полями.
