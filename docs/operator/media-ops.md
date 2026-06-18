# Woodright Media Ops — оператор

Единый QA-интерфейс для медиа-операций. **Не пишет в каталог** — только triage, assignment, export.

## URL

| Режим | URL |
|-------|-----|
| Hub (→ Assign) | http://localhost:3002/qa/media-ops |
| **Assign** (daily driver) | http://localhost:3002/qa/media-ops/assign |
| Inbox (orphan Phase 2.1) | http://localhost:3002/qa/media-ops/inbox |
| Launch (Phase 5+) | http://localhost:3002/qa/media-ops/launch |

Старый v2 URL `/qa/legacy-media-assignment-board-v2` **редиректит** на Assign (query сохраняется).

## Запуск

```bash
cd apps/storefront
FURNITURE_REPO_ROOT=/path/to/furniture-commerce yarn dev --port 3002
```

## Режимы

### Assign
Назначение медиа на карточки (ядро — Legacy Media Assignment Board v2).

- Табы Inbox · Assign · Launch вверху
- **Export** в header → drawer: Copy/Download assignment JSON
- JSON: обёртка с `do_not_auto_apply: true`, внутри `assignment` — тот же формат, что standalone v2

### Inbox
Очередь сирот (Phase 2.1) + supplement gate (Phase 3).

- **Три источника медиа:** прайс-лист (identity), Яндекс Disk (файлы), legacy site (scrape). Cross-audit: `tmp/media-ops-codex-review/legacy-yandex-pricelist-cross-audit.md`
- **Блокер:** без `tmp/source-media-completeness-audit-full-legacy-cache/` orphan queue не загружается (404)
- **Сейчас operable:** CLP, Oliver, Provence. Oxford / Monchelsea / WW — hold
- Яндекс-путь без local mirror **нельзя** назначать в Assign

## Deep links (Assign)

- `?handle=co-02-1` — фокус на продукт
- `?from=orphan` — breadcrumb Inbox › handle
- `?highlight=<inventory_id>` — scroll + pulse в media pool

## Миграция localStorage

При наличии старых ключей (`orphan review`, `supplement`, `v2 board`) показывается баннер. Полный import — Phase 6; v2 LS работает параллельно.

## Smoke

```bash
node tmp/media-ops-phase1-smoke.mjs
```

Требует dev server на `:3002`.
