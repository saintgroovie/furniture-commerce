# Woodright Media Ops — пошаговый план реализации

Единый операторский интерфейс для QA-бордов медиа и Launch A.  
**Ядро UX:** `Legacy Media Assignment Board v2` (режим Assign).  
**Репозиторий:** `furniture-commerce`  
**Код:** `apps/storefront/src/app/qa/`

Связанные handoff-документы:

- `docs/launch-a-data-ops-handoff/README.md` — Launch / matrix context
- `docs/project/CODEMAP.md` — карта репозитория

---

## 0. Цели и ограничения

### Цели

1. Один продукт **Media Ops** вместо разрозненных `/qa/*` бордов.
2. Три режима с разными вопросами оператора, одним визуальным языком.
3. **Assign (v2)** — эталон полировки; Inbox и Launch подключаются как режимы.
4. Автомиграция `localStorage` из старых бордов без потери решений.
5. В каждом режиме — **только нужные кнопки**, максимальная наглядность.

### Жёсткие ограничения (не нарушать)

- **Нет записи в Medusa / DB / seed** из UI.
- **Нет auto-apply** в `data/normalized/**` — все export с `do_not_auto_apply: true`.
- **Нет commit/push** без явного запроса оператора.
- API routes существующих бордов **не ломать** на ранних фазах — reuse путей.
- Foreground-only QA: smoke против уже запущенного dev server (`:3002`, matrix `:3004`).
- **Codex review обязателен на каждый task** (§7.0): task не `done` без `approve` / `approve-with-notes`, артефакта в `tmp/media-ops-codex-review/` **и** remediation по findings (прочитать отчёт → **сразу имплементировать** → перепроверить → **только потом** Woodright report packet).

### Что НЕ входит в этот план

- Apply-скрипты normalized / materialization.
- Изменения `data/normalized/**`, backend, ingestion.
- Покупательский storefront.

---

## 1. Целевая карта URL

| URL | Режим | Наследие |
|-----|--------|----------|
| `/qa/media-ops` | redirect → Assign | — |
| `/qa/media-ops/inbox` | Inbox | orphan review + supplement approval |
| `/qa/media-ops/assign` | Assign | Legacy Media Assignment Board v2 |
| `/qa/media-ops/launch` | Launch | Willie Winkie Flow A matrix board |

### Legacy redirects (сохранять query string)

| Старый URL | Новый URL |
|------------|-----------|
| `/qa/legacy-media-assignment-board-v2` | `/qa/media-ops/assign` |
| `/qa/source-media-orphan-review` | `/qa/media-ops/inbox?tab=orphan` |
| `/qa/legacy-site-media-approval-board` | `/qa/media-ops/inbox?tab=supplement` |
| `/qa/willie-winkie-flow-a-matrix-board` | `/qa/media-ops/launch` |
| `/qa/willie-winkie-business-gate-board` | `/qa/media-ops/launch?legacy=gate` |
| `/qa/legacy-media-assignment-board` (v1) | `/qa/media-ops/assign?legacy=v1-deprecated` |

---

## 2. Целевая структура файлов

```
apps/storefront/src/app/qa/media-ops/
  layout.tsx
  page.tsx
  media-ops-shell.css
  MediaOpsShell.tsx
  MediaOpsExportDrawer.tsx
  media-ops-session.ts            # Phase 6 — unified LS
  media-ops-migration.ts          # Phase 1: detect + banner; Phase 6: full import
  media-ops-export.ts
  media-ops-assign-bridge.tsx
  assign/
    page.tsx
    layout.tsx
    AssignModeClient.tsx
    media-ops-v2-bridge-adapter.ts   # adapter: V2ShellBridgeSnapshot → MediaOpsAssignBridge
    InboxQueueSidebar.tsx              # Phase 4
  inbox/ …
  launch/ …

apps/storefront/src/app/qa/legacy-media-assignment-board-v2/
  legacy-board-v2-shell-bridge.ts      # neutral snapshot; v2 НЕ импортирует media-ops
```

**Архитектурное правило (Codex):** `legacy-media-assignment-board-v2/**` не импортирует `media-ops/**`. Интеграция только через `V2ShellBridgeSnapshot` + adapter в `media-ops/assign/`.

**Существующие папки (Phase 1–5):** не удалять сразу — thin redirect `page.tsx` + постепенный рефактор Client → panels.

---

## 3. Единая сессия и автомиграция

### Ключ localStorage

```
woodright:media-ops:v1
```

### Форма сессии

```ts
{
  version: 1,
  savedAt: string,                    // ISO
  lastMode: "inbox" | "assign" | "launch",
  lastHandle: string | null,
  inbox: {
    orphan: Record<string, PersistedOrphanRow>,
    supplement: Record<string, PersistedSupplementItem>,
  },
  assign: {
    productStates: Record<string, V2ProductState>,
    selectedHandle: string | null,
  },
  launch: {
    // опционально; matrix в основном пишет CSV через API
    rowPatches?: Record<string, Partial<MatrixRow>>,
  },
  migration: {
    importedFrom: string[],
    importedAt: string | null,
  },
}
```

### Источники миграции (canonical order — Codex 2026-06-17)

Порядок import = operator workflow: **Inbox orphan → supplement (v2, затем v1 fallback) → Assign v2 → overlay metadata → Launch gate (deprecated)**.

| importOrder | Старый ключ | Секция | mode | phase | dual-write | import | Файл-источник |
|-------------|-------------|--------|------|-------|------------|--------|---------------|
| 10 | `woodright:source-media-orphan-review:v1` | `inbox.orphan` | inbox | 2 | yes | primary | `source-orphan-review-persistence.ts` |
| 20 | `woodright:legacy-site-media-approval-board:v2` | `inbox.supplement` | inbox | 3 | yes | primary | `approval-board-persistence.ts` |
| 21 | `woodright:legacy-site-media-approval-board:v1` | `inbox.supplement` | inbox | 3 | no | fallback после v2 | `approval-board-persistence.ts` |
| 30 | `furniture-legacy-media-assignment-v2board-state` | `assign` | assign | 4/6 | yes | primary | `legacy-board-v2-persistence.ts` |
| 31 | `woodright:orphan-p0-overlay:v1` | `assign.overlay` / inbox metadata | assign | 4 | yes* | metadata | `orphan-p0-overlay-persistence.ts` |
| 50 | `woodright:willie-winkie-business-gate-board:v1` | `launch.rowPatches` | launch | 5 | no | deprecated | `business-gate-board-persistence.ts` |

\* overlay dual-write только пока активен `?overlay=orphan-p0-top50` (до Phase 4 sidebar).

**Не в detect / import:**

| Ключ / артефакт | Причина |
|-----------------|---------|
| `woodright:media-ops:v1` | canonical target session |
| `woodright:media-ops:migration-banner-dismissed:v1` | sessionStorage UI state |
| matrix board CSV/API | нет localStorage; `willie-winkie-flow-a-matrix-board/api/*` |
| assignment board v1 URL | redirect only; persistence key не найден |

Реестр в коде: `media-ops/media-ops-migration.ts` → `LEGACY_STORAGE_SOURCES` (sorted by `importOrder`).

### Правила миграции

1. **Read-only** чтение старых ключей при detect.
2. Merge по id; при конфликте — побеждает более новый `saved_at` / `savedAt`.
3. Старые ключи **не удалять** при import; записать `migration.importedFrom`.
4. **Dual-write** (Phase 2–4): писать и `woodright:media-ops:v1`, и старый ключ — флаг `MEDIA_OPS_DUAL_WRITE=true` в коде до Phase 5.
5. Import **идемпотентный** — повтор не дублирует строки.
6. Banner: «Найдены решения в старых бордах» → кнопки **Импортировать** / **Позже**.

**Phase 1 (частично, Codex):** `media-ops-migration.ts` — только **detect** + баннер «Позже»; v2 localStorage работает параллельно. Полный import в `woodright:media-ops:v1` — Phase 6.

### Перекрёстный аудит медиа-источников (Codex 2026-06-18)

Три семейства: **прайс-лист** (workbook) · **Яндекс Disk** (front-manifest) · **legacy site** (scrape + inventory).

| Артефакт | Путь |
|----------|------|
| Полный отчёт | `tmp/media-ops-codex-review/legacy-yandex-pricelist-cross-audit.md` |
| Статистика | `tmp/media-ops-codex-review/legacy-yandex-pricelist-cross-stats.json` |
| Пересчёт stats | `node tmp/media-ops-codex-review/compute-cross-stats.cjs` |

**SoT:** прайс = identity (SKU/title); Яндекс = media hints (preview только если зеркало локально); legacy scrape = supporting evidence, не каталог.

**Операторский scope сейчас:** CLP / Oliver / Provence (108 seed). Oxford, Monchelsea, WW — blocked (см. отчёт §C).

**P1 блокер Inbox orphan:** `tmp/source-media-completeness-audit-full-legacy-cache/` отсутствует → bootstrap 404.

---

## 4. UI shell — общие элементы (все режимы)

### Всегда в header

| Элемент | Поведение |
|---------|-----------|
| Заголовок | **Woodright Media Ops** |
| Mode tabs | `Inbox` · `Assign` · `Launch` — `Link` + active underline |
| Badge | `dev · no catalog writes` |
| Save status | `Сохранено HH:MM` / `Не сохранено` |
| Кнопка **Export** | открывает drawer (единственная export-кнопка в header) |

### Export drawer (контент зависит от режима)

| Режим | Кнопки |
|-------|--------|
| Inbox | Copy triage JSON · Download triage JSON |
| Assign | Copy assignment JSON · Download assignment JSON |
| Launch | Save CSV · Copy matrix JSON · Download matrix JSON |

### Спрятать в drawer → «Дополнительно»

- Reset session (assign) — double-confirm
- Migration import manual trigger (Phase 6)
- Build badge / debug paths (только dev)

**Не смешивать** в «Дополнительно»: diagnostics и destructive reset — отдельные подсекции (Codex).

### Drawer accessibility (acceptance, Codex)

- [x] `role="dialog"` + `aria-modal="true"`
- [x] Escape закрывает drawer
- [x] Initial focus на кнопку «Закрыть»
- [x] Backdrop click закрывает drawer

### CSS

- База: скопировать токены из `legacy-media-assignment-board-v2/legacy-media-board-v2-page.css`.
- Единый grid: header 48px, tabs 40px, content `flex-1`.

---

## 5. Спецификация режимов — минимум кнопок

### 5.1 Inbox — tab «Очередь сирот»

**Вопрос оператора:** «Что это за файл и можно ли его трогать?»

**Layout:** master-detail (не grid всех карточек).

```
[Tab: Очередь сирот | Supplement gate]
┌──────────────┬─────────────────────┬──────────────────┐
│ Список       │ Крупное превью      │ Решение          │
│ + фильтры    │ + basename          │ 5 chips          │
│              │ + SKU/handle        │ 1 primary CTA    │
│              │ ≤3 флага            │ notes 1 строка   │
└──────────────┴─────────────────────┴──────────────────┘
```

**Фильтры (видимые):**

- Tier: `P0` (default) · `P1` · `Все`
- Toggle: `Только cross-SKU risk`
- Search по basename

**Спрятать в «Фильтры ▾»:** provenance, classification, new legacy only.

**Флаги на строке списка (max 3):** tier · cross-SKU · duplicate found.

**Кнопки решения (справа):**

| Кнопка | `operator_decision` | Стиль |
|--------|---------------------|-------|
| **→ В Assign** | `map_candidate` | primary |
| Отклонить | `reject_noise` | secondary |
| Заблокировать cross-SKU | `blocked_cross_sku` | danger |
| Нужен контекст | `needs_more_context` | secondary |
| Нужен источник | `content_request` | secondary |

**Свернуть по умолчанию:** `why_not_safe`, длинный precheck → «Почему не safe ▾».

**Навигация:** prev/next между строками очереди; URL sync `?tab=orphan&source_id=…`.

**API (без изменений):** `GET /qa/source-media-orphan-review/api/bootstrap`

---

### 5.2 Inbox — tab «Supplement gate»

**Вопрос оператора:** «Можно ли добавить этот файл в систему?»

**Workflow strip:** `1 Дубль → 2 Роль → 3 Approve`

**Кнопки на карточке:**

| Группа | Кнопки |
|--------|--------|
| Решение | **Approve** · **Reject** · Needs review |
| Роль | front · front_3_4 · side · detail · interior · scheme · unknown |
| Дубль | Уникальный · Дубль · Возможный дубль |

**Свернуть:** Willie Winkie guide → «Подсказка WW ▾».

**Сайдбар-фильтры:** `Все` · `Нужна роль` (остальные workflow filters убрать из главного UI).

**Нет кнопки Assign** — после approve статус «Ожидает append в inventory».

**API (без изменений):**

- `GET /qa/legacy-site-media-approval-board/api/checklist`
- `GET /qa/legacy-site-media-approval-board/api/sku-context`
- preview routes

---

### 5.3 Assign

**Вопрос оператора:** «Как положить медиа на карточку?»

**Сохранить без регрессии:**

- 3-column grid: products · pool · workspace
- Color variants, role slots, gallery, duplicate collapse
- `data-v2-*` селекторы для smoke

**Изменить:**

| Было | Станет |
|------|--------|
| Собственный h1 + badge в v2 | Shell header; v2 `embeddedInShell={true}` скрывает дубли |
| ExportToolbar Copy/Download/Reset | Только save status inline; export в shell drawer |
| `?overlay=orphan-p0-top50` | Phase 4: sidebar «Из Inbox» |
| Banners CO-02 | Один info-chip в assign subheader |

**Дополнительно:**

- Breadcrumb при `?from=orphan`: `Inbox › {handle} › Assign`
- Deep link: `?handle=&highlight=` — scroll + pulse 2s на `[data-v2-pool-inventory-id]`; fallback: no-op если id не в pool

**Embedded Assign (Codex):** ExportToolbar **скрыт** полностью; export только через shell drawer.
- Link на карточке pool: «Вернуть в Inbox» (без triage chips в Assign)

**API (без изменений на Phase 1):**

- `/qa/legacy-media-assignment-board-v2/api/*`
- preview: `/qa/legacy-media-assignment-board/preview?rel=…`

**localStorage:** через `media-ops-session.assign` + dual-write в `furniture-legacy-media-assignment-v2board-state` до Phase 5.

---

### 5.4 Launch

**Вопрос оператора:** «Как завести продукт в каталоге (не медиа)?»

**Видимые кнопки:**

- **Сохранить строку** (primary)
- Approve row · Needs review
- **Следующий handle →**

**В drawer:** Save CSV · Copy/Download matrix JSON · Bulk fill → «Инструменты ▾»

**API (без изменений):** `/qa/willie-winkie-flow-a-matrix-board/api/*`

**Порт:** matrix может оставаться на `:3004` — shell тот же, dev script не менять в Phase 5.1.

---

## 6. Export контракты

| `export_kind` | Источник логики | Когда доступен |
|---------------|-----------------|----------------|
| `inbox_triage` | orphan + supplement export modules | Inbox mode |
| `assignment_v2` | `media-ops-export.ts` wrapper + `legacy-board-v2-export.ts` | Assign mode |
| `matrix_launch` | matrix export routes | Launch mode |
| `combined_handoff` | merge всех секций | drawer «Дополнительно» |

### Assignment export (решение Codex review)

Media Ops handoff — **обёртка** `MediaOpsAssignmentExportPayload`:

- `do_not_auto_apply: true` на верхнем уровне
- `assignment` — **byte-identical** к standalone `buildV2ExportJSON()` для тех же `productStates`

Standalone v2 toolbar по-прежнему экспортирует «чистый» v2 JSON без обёртки.

**Acceptance:** `JSON.stringify(payload.assignment)` === `JSON.stringify(buildV2ExportJSON(...))`.

### Архитектура (обязательное правило)

- `legacy-media-assignment-board-v2/**` **не импортирует** `media-ops/**`
- Интеграция через `V2ShellBridgeSnapshot` + adapter в `media-ops/assign/`

---

## 7. Фазы и задачи

Порядок выполнения:

```
Phase 1 (shell + assign)
  → Phase 6.1–6.2 (session + migration core) можно параллельно с Phase 2
  → Phase 2 (inbox orphan)
  → Phase 3 (inbox supplement)
  → Phase 4 (inbox ↔ assign bridge)
  → Phase 5 (launch + cleanup)
```

**Один PR ≈ одна Phase** (или Phase 1 целиком как PR1).

**На каждый Task и Phase gate — обязательный Codex review** (см. §7.0). Task **не считается done**, пока review не `approve` / `approve-with-notes` без открытых P1 **и** пока предложенные Codex правки не прочитаны и не исправлены (или явно не отложены в плане).

---

## 7.0 Обязательный Codex review (каждый шаг)

### Когда запускать

| Момент | Обязательно |
|--------|-------------|
| После implementation task | да |
| После smoke / foreground validation | да |
| **До** перевода task в `done` | да |
| **До** старта следующего task в той же phase | да |
| После закрытия всех tasks phase | phase gate review |
| После remediation по `request-changes` | повторный scoped review |

### Цикл: review → прочитать → **сразу имплементировать** → перепроверить → **report packet**

**Hard rule (порядок сессии):**

```
implementation → smoke → Codex review
  → прочитать findings
  → СРАЗУ имплементировать в коде/плане (та же foreground-сессия)
  → remediation.md + повторный smoke (+ re-review при request-changes)
  → ТОЛЬКО ПОТОМ Woodright report packet (FORMAT A)
```

Между получением Codex review и финальным report packet **не должно быть** handoff-сообщения с verdict `done` / `partial` — только работа по findings.

Review **не** сводится к запуску Codex и сохранению файла. Оператор/агент **обязан**:

1. **Прочитать** полный отчёт Codex (MCP content или `tmp/.../review.md`) — каждый P1/P2/P3 с path и сутью.
2. **Сразу имплементировать** в той же сессии (код, manifest, apply-скрипты, план) всё, что Codex пометил как blocker / request-changes:
   - **P1** — закрыть в той же сессии до `done`; defer только с записью в план + причиной.
   - **P2** — закрыть в той же сессии, если правка локальная; иначе — явный хвост в remediation + план.
   - **P3** — по усмотрению, но зафиксировать в remediation (сделано / отложено).
3. **Задокументировать** в `phase{N}-task{N.M}-remediation.md`: finding → что сделано (файл, суть) или почему defer.
4. **Перезапустить** smoke / foreground checks после правок.
5. **Повторный scoped review**, если первый verdict был `request-changes` или остались P1.
6. Только после шагов 1–5 — **выдать Woodright report packet** (FORMAT A) и переводить task в `done`.

**Запрещено:**

- выдавать Woodright report packet **сразу после** Codex review, **до** имплементации findings;
- verdict `done` / `partial` в report packet, если remediation ещё не сделана;
- ставить task `done` с открытыми P1;
- игнорировать отчёт или ограничиться копированием verdict в `## Codex CLI reviewer` без правок кода.

**Эталон (Phase 1):** `tmp/media-ops-codex-review/remediation-log.md` — таблица finding → fix.  
**Эталон (Phase 2.1):** `tmp/media-ops-codex-review/phase2-task2.1-remediation.md` — P2 закрыты до report packet.

### Scope (жёстко)

- Только файлы **текущего task** + затронутые соседи (redirect, export, persistence).
- **Не** `codex review --uncommitted` на весь dirty tree — шум и ложные P1.
- Предпочтительно: MCP `user-codex-woodright-reviewer` с явным path list в prompt.

### Команды

**Scoped MCP (предпочтительно):**

```text
Woodright Media Ops — Codex review Task {N.M}

Repo: furniture-commerce
Scope ONLY:
- apps/storefront/src/app/qa/media-ops/...
- (другие paths task)

Read: docs/operator/media-ops-implementation-plan.md Task {N.M} acceptance.
Check: architecture guardrails, do_not_auto_apply, v2↔media-ops coupling, a11y, effect loops, export parity.
Verdict: approve | approve-with-notes | request-changes
P1/P2/P3 findings with file paths.
```

**CLI fallback (scoped paths в prompt, не whole-repo uncommitted):**

```bash
codex exec review -- "$(cat <<'EOF'
Scope: apps/storefront/src/app/qa/media-ops/assign/ only
Task: Media Ops 1.2 — assign wrapper
Acceptance: docs/operator/media-ops-implementation-plan.md
EOF
)"
```

### Артефакты (обязательны)

| Артефакт | Путь |
|----------|------|
| Review summary | `tmp/media-ops-codex-review/phase{N}-task{N.M}-review.md` |
| Remediation (если были правки) | `tmp/media-ops-codex-review/phase{N}-task{N.M}-remediation.md` |
| Phase gate (после всех tasks phase) | `tmp/media-ops-codex-review/phase{N}-gate-review.md` |

**Remediation-файл обязателен**, если verdict был `request-changes` или есть хотя бы один исправленный/отложенный finding.

### Acceptance gate (task не done без этого)

- [ ] Отчёт Codex **прочитан** целиком (не только verdict строкой)
- [ ] Все **P1** исправлены в коде или явно deferred в плане
- [ ] **P2** закрыты или перечислены в remediation с причиной defer
- [ ] `phase{N}-task{N.M}-remediation.md` заполнен (finding → действие)
- [ ] Verdict: **`approve`** или **`approve-with-notes`** (после remediation + re-review при необходимости)
- [ ] Нет открытых **P1** (или явный defer в плане с причиной)
- [ ] Если review меняет контракт — **план обновлён до merge в done**
- [ ] Smoke / foreground checks **перезапущены** после правок по Codex
- [ ] **Woodright report packet выдан только после** имплементации findings и перепроверки (не сразу после получения Codex review)
- [ ] Woodright report packet содержит секцию **`## Codex CLI reviewer`** + что исправлено по review

### Phase gate (дополнительно к per-task)

После последнего task phase — один **phase gate** review на весь diff phase + smoke matrix.

---

### PHASE 1 — Shell + Assign

**Статус:** done (2026-06-17), после Codex remediation

**Цель:** единая точка входа; daily driver = Assign без регрессии v2.

#### Task 1.1 — Создать media-ops layout и shell

**Статус:** done

**Файлы:** `layout.tsx`, `page.tsx`, `MediaOpsShell.tsx`, `media-ops-shell.css`, `media-ops-assign-bridge.tsx`

**Acceptance:**

- [x] `GET /qa/media-ops/assign` → 200, tabs видны
- [x] Переключение tabs меняет route, layout не remountится
- [x] Shell показывает «⏳ Загрузка Assign…» до регистрации bridge

**Как проверено:** `node tmp/media-ops-phase1-smoke.mjs` (assign 200)

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17)
- [x] Артефакт: `tmp/media-ops-codex-review/scoped-review-summary.md`
- [x] Remediation: `tmp/media-ops-codex-review/remediation-log.md` (shell loading P3)

---

#### Task 1.2 — Assign wrapper над v2

**Статус:** done

**Файлы:**

- `assign/page.tsx`, `assign/layout.tsx`, `AssignModeClient.tsx`, `media-ops-v2-bridge-adapter.ts`
- `legacy-board-v2-shell-bridge.ts` — neutral snapshot (v2 **не** импортирует media-ops)
- правка `LegacyMediaBoardV2Client.tsx` — `embeddedInShell`, `onShellBridgeSnapshot`, `highlightInventoryId`

**Acceptance:**

- [x] Назначение ролей, gallery, color variants работают
- [x] `data-v2-embedded-in-shell="true"` на media-ops assign
- [x] localStorage v2 сохраняет состояние
- [x] Breadcrumb при `?from=orphan`: `Inbox › {handle}`
- [x] `?highlight=` — scroll + pulse на `[data-v2-pool-inventory-id]`

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17)
- [x] Scope: `legacy-board-v2-shell-bridge.ts`, `media-ops-v2-bridge-adapter.ts`, `LegacyMediaBoardV2Client.tsx`
- [x] P1 закрыт: v2 не импортирует `media-ops/**`; highlight реализован
- [x] Артефакт: `tmp/media-ops-codex-review/remediation-log.md`

---

#### Task 1.3 — Export drawer (только Assign)

**Статус:** done

**Файлы:** `MediaOpsExportDrawer.tsx`, `media-ops-export.ts`, `media-ops-assign-bridge.tsx`; `ExportToolbar.tsx` → `null` при embedded

**Acceptance:**

- [x] Handoff JSON: top-level `do_not_auto_apply: true`
- [x] `payload.assignment` byte-identical к `buildV2ExportJSON(...)` для тех же states
- [x] Drawer: Copy / Download; Reset в «Дополнительно» + double-confirm
- [x] Нет дублирующих Copy/Reset в body (smoke)
- [x] Bridge: стабильный `setBridge` через `useCallback` (без effect loop)
- [x] Drawer a11y: `role="dialog"`, `aria-modal`, Escape, focus on close

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17)
- [x] P1 закрыт: wrapper export + `assignment` parity; bridge `useCallback`
- [x] P2 закрыт: drawer a11y; duplicate ExportToolbar убран
- [x] Артефакт: `tmp/media-ops-codex-review/scoped-review-summary.md`

---

#### Task 1.4 — Legacy redirect v2

**Статус:** done (2026-06-17)

**Файл:** `qa/legacy-media-assignment-board-v2/page.tsx`

**Acceptance:**

- [x] `307` → `/qa/media-ops/assign` + preserved query (`handle`, `overlay`, …)

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17, в составе Phase 1 gate)
- [x] Scope: `legacy-media-assignment-board-v2/page.tsx`
- [x] Артефакт: `tmp/media-ops-codex-review/remediation-log.md`

---

#### Task 1.5 — Operator one-pager + smoke

**Статус:** done

**Файлы:** `docs/operator/media-ops.md`, `tmp/media-ops-phase1-smoke.mjs`

**Phase 1 DONE:**

- [x] Оператор работает в `/qa/media-ops/assign`
- [x] Smoke 3/3: assign 200, redirect, no duplicate toolbar buttons

**Smoke matrix (foreground):**

```bash
node tmp/media-ops-phase1-smoke.mjs
# assign 200 · legacy redirect 307 · no duplicate Copy/Reset in embedded body
```

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17)
- [x] Артефакт: `tmp/media-ops-codex-review/remediation-log.md`

**Phase 1 gate review:**

- [x] `tmp/media-ops-codex-review/scoped-review-summary.md` — Phase 1 Tasks 1.1–1.5
- [x] Smoke 3/3 после remediation

---

### PHASE 6 — Session layer (параллельно Phase 2)

#### Task 6.1 — `media-ops-session.ts`

**Файлы:**

- `qa/media-ops/media-ops-session.ts`
- `qa/media-ops/media-ops-types.ts`

**Шаги:**

1. `loadSession()`, `saveSession()`, `patchSession()`, debounce 500ms.
2. `getSaveStatus()` для shell indicator.
3. SSR-safe guards (`typeof window`).

**Acceptance:**

- [ ] Session round-trip в localStorage
- [ ] Нет throw при пустом ключе

**Codex review (обязательно):**

- [ ] Scope: `media-ops-session.ts`, `media-ops-types.ts`, shell save indicator
- [ ] Артефакт: `tmp/media-ops-codex-review/phase6-task6.1-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: SSR guards, debounce, dual-write hook points, no throw on corrupt JSON

---

#### Task 6.2 — `media-ops-migration.ts`

**Файл:** `qa/media-ops/media-ops-migration.ts`

**Phase 1 (частично):** `detectLegacySources()` + banner «Позже» в shell — **done**. Полный `importLegacySession()` — Phase 6.

**Шаги (осталось):**

1. ~~`detectLegacySources(): { key, count }[]`~~ (done)
2. `importLegacySession(): MigrationSummary`
3. Idempotent merge по id
4. ~~`MediaOpsShell` показывает banner при detect~~ (done, без кнопки Import до Phase 6)

**Acceptance:**

- [ ] Повторный import не удваивает записи
- [ ] Summary: orphan N, supplement M, assign K handles

**Codex review (обязательно):**

- [ ] Scope: `media-ops-migration.ts`, banner UI, merge helpers
- [ ] Артефакт: `tmp/media-ops-codex-review/phase6-task6.2-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: idempotent merge, старые ключи не удаляются, conflict resolution по timestamp

---

#### Task 6.3 — Dual-write toggle

**Шаги:**

1. Константа `MEDIA_OPS_DUAL_WRITE = true` в `media-ops-session.ts`.
2. При save assign → писать и unified, и `furniture-legacy-media-assignment-v2board-state`.
3. Phase 5: выключить dual-write.

**Codex review (обязательно):**

- [ ] Scope: `MEDIA_OPS_DUAL_WRITE` flag, save paths assign/inbox
- [ ] Артефакт: `tmp/media-ops-codex-review/phase6-task6.3-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: нет рассинхрона unified vs legacy keys при toggle

**Phase 6 gate review:**

- [ ] `tmp/media-ops-codex-review/phase6-gate-review.md` после Tasks 6.1–6.3

---

### PHASE 2 — Inbox tab «Очередь сирот»

**Цель:** orphan review в Inbox без старого standalone UI.

#### Task 2.1 — Extract orphan panel

**Статус:** done (2026-06-17)

**Файлы:**

- `inbox-orphan/OrphanQueuePanel.tsx`
- `inbox-orphan/useOrphanQueue.ts`
- `inbox-orphan/orphan-queue-types.ts`
- `media-ops-session.ts`, `media-ops-types.ts` (orphan slice)
- `inbox/InboxModeClient.tsx`, `inbox/page.tsx`
- `SourceMediaOrphanReviewClient.tsx` — thin wrapper

**Acceptance:**

- [x] 5 decision chips + primary «→ В Assign»
- [x] P0 default filter

**Codex review (обязательно):**

- [x] Verdict: `approve-with-notes` (2026-06-17)
- [x] Артефакт: `tmp/media-ops-codex-review/phase2-task2.1-review.md`
- [x] Remediation: `tmp/media-ops-codex-review/phase2-task2.1-remediation.md` (P2 closed)
- [x] Smoke: `tmp/media-ops-phase2-task21-smoke.mjs` — 4/4

---

#### Task 2.2 — Master-detail layout

**Файл:** `inbox/InboxModeClient.tsx`

**Шаги:**

1. Tabs: `orphan` | `supplement` (supplement stub до Phase 3).
2. Master-detail для orphan: list · preview · actions.
3. URL: `?tab=orphan&source_id=`.
4. Prev/Next keyboard optional.

**Acceptance:**

- [ ] Не grid всех карточек — одна активная
- [ ] `why_not_safe` collapsed by default

**Codex review (обязательно):**

- [ ] Scope: `inbox/InboxModeClient.tsx`, tab routing, master-detail layout
- [ ] Артефакт: `tmp/media-ops-codex-review/phase2-task2.2-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: URL sync `?tab=orphan&source_id=`; UX «минимум кнопок» §8

---

#### Task 2.3 — Inbox → Assign navigation

**Шаги:**

1. Primary CTA: set `map_candidate` + `router.push('/qa/media-ops/assign?handle=&from=orphan&highlight=')`.
2. Assign: breadcrumb при `from=orphan`.

**Acceptance:**

- [ ] 1 click от строки orphan до workspace handle

**Codex review (обязательно):**

- [ ] Scope: orphan CTA navigation, assign breadcrumb/deep link
- [ ] Артефакт: `tmp/media-ops-codex-review/phase2-task2.3-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: `map_candidate` persist до navigation; `highlight` на assign

---

#### Task 2.4 — Orphan migration + redirect

**Шаги:**

1. Подключить migration для orphan key.
2. `source-media-orphan-review/page.tsx` → redirect inbox `?tab=orphan`.

**Phase 2 DONE когда:**

- [ ] P0 очередь разбирается без старого URL
- [ ] Export triage JSON из drawer

**Codex review (обязательно):**

- [ ] Scope: orphan redirect, migration hook, inbox triage export stub
- [ ] Артефакт: `tmp/media-ops-codex-review/phase2-task2.4-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

**Phase 2 gate review:**

- [ ] `tmp/media-ops-codex-review/phase2-gate-review.md` + smoke orphan → assign

---

### PHASE 3 — Inbox tab «Supplement gate»

#### Task 3.1 — Extract supplement panel

**Файлы:**

- `inbox-supplement/SupplementGatePanel.tsx`
- `inbox-supplement/useSupplementGate.ts`

**Шаги:**

1. Рефактор из `LegacySiteMediaApprovalBoardClient.tsx`.
2. Master-detail как orphan.
3. Persist → `media-ops-session.inbox.supplement`.

**Codex review (обязательно):**

- [ ] Scope: `inbox-supplement/SupplementGatePanel.tsx`, `useSupplementGate.ts`
- [ ] Артефакт: `tmp/media-ops-codex-review/phase3-task3.1-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: checklist/sku-context API не сломаны; persist dual-read

---

#### Task 3.2 — Упростить кнопки supplement

**Шаги:**

1. Workflow strip вверху tab.
2. WW guide collapsible.
3. Sidebar filters: `Все` · `Нужна роль`.

**Acceptance:**

- [ ] ≤3 групп кнопок на карточке

**Codex review (обязательно):**

- [ ] Scope: supplement UI simplification, workflow strip, collapsible WW guide
- [ ] Артефакт: `tmp/media-ops-codex-review/phase3-task3.2-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: §8 чеклист «минимум кнопок» для supplement

---

#### Task 3.3 — Supplement migration + redirect

**Шаги:**

1. Migration approval board keys.
2. Redirect `/qa/legacy-site-media-approval-board` → inbox `?tab=supplement`.

**Codex review (обязательно):**

- [ ] Scope: supplement migration keys, legacy redirect
- [ ] Артефакт: `tmp/media-ops-codex-review/phase3-task3.3-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

---

#### Task 3.4 — Inbox export в drawer

**Шаги:**

1. `export_kind: inbox_triage` — секции orphan + supplement.
2. Reuse `source-orphan-review-export.ts` + `approval-board-export.ts`.

**Phase 3 DONE когда:**

- [ ] Supplement batch можно пройти полностью в Inbox

**Codex review (обязательно):**

- [ ] Scope: `export_kind: inbox_triage`, drawer export, orphan+supplement merge
- [ ] Артефакт: `tmp/media-ops-codex-review/phase3-task3.4-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: `do_not_auto_apply: true` на triage export

**Phase 3 gate review:**

- [ ] `tmp/media-ops-codex-review/phase3-gate-review.md`

---

### PHASE 4 — Inbox ↔ Assign bridge

#### Task 4.1 — Sidebar «Из Inbox» в Assign

**Файл:** `assign/InboxQueueSidebar.tsx`

**Шаги:**

1. Список orphan rows с `map_candidate` и resolved handle.
2. Click → select handle + highlight in pool.
3. Данные из session, не overlay artifact.

**Codex review (обязательно):**

- [ ] Scope: `assign/InboxQueueSidebar.tsx`, session read `inbox.orphan`
- [ ] Артефакт: `tmp/media-ops-codex-review/phase4-task4.1-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

---

#### Task 4.2 — Deprecate overlay URL

**Шаги:**

1. `?overlay=orphan-p0-top50` → redirect assign + open sidebar.
2. Удалить `OrphanP0OverlayPanel` из default assign view (оставить код до Phase 5 если нужен fallback).

**Codex review (обязательно):**

- [ ] Scope: overlay redirect, sidebar default open, overlay deprecation
- [ ] Артефакт: `tmp/media-ops-codex-review/phase4-task4.2-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: старые bookmark `?overlay=orphan-p0-top50` не ломаются

---

#### Task 4.3 — Readiness chips на product list

**Шаги:**

1. Маленькие badges на handle: `нет front` · `inbox pending` · `готово`.

**Phase 4 DONE когда:**

- [ ] Orphan P0 workflow без отдельного overlay URL

**Codex review (обязательно):**

- [ ] Scope: readiness chips на product list
- [ ] Артефакт: `tmp/media-ops-codex-review/phase4-task4.3-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

**Phase 4 gate review:**

- [ ] `tmp/media-ops-codex-review/phase4-gate-review.md` — inbox ↔ assign E2E без overlay URL

---

### PHASE 5 — Launch + cleanup

#### Task 5.1 — Launch wrapper

**Файлы:**

- `launch/page.tsx`
- `launch/LaunchModeClient.tsx`

**Шаги:**

1. Embed `MatrixBoardClient` с `embeddedInShell`.
2. Упростить visible buttons per §5.4.
3. Redirect matrix board URL.

**Codex review (обязательно):**

- [ ] Scope: `launch/LaunchModeClient.tsx`, matrix embed, `embeddedInShell`
- [ ] Артефакт: `tmp/media-ops-codex-review/phase5-task5.1-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: matrix API routes; порт `:3004` не ломается

---

#### Task 5.2 — Deprecate business gate

**Шаги:**

1. Redirect → launch `?legacy=gate` + deprecation banner.

**Codex review (обязательно):**

- [ ] Scope: business gate redirect, deprecation banner
- [ ] Артефакт: `tmp/media-ops-codex-review/phase5-task5.2-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

---

#### Task 5.3 — Remove standalone clients

**Шаги:**

1. Удалить дублирующий UI из старых `*Client.tsx` (оставить redirects + API).
2. Выключить `MEDIA_OPS_DUAL_WRITE`.
3. Обновить `docs/operator/media-ops.md`.

**Codex review (обязательно):**

- [ ] Scope: удаление standalone UI, `MEDIA_OPS_DUAL_WRITE=false`, operator doc
- [ ] Артефакт: `tmp/media-ops-codex-review/phase5-task5.3-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1
- [ ] Проверить: redirects + API routes остаются; нет orphan imports

---

#### Task 5.4 — Foreground QA proof

**Шаги:**

1. Smoke: inbox orphan → assign → export JSON.
2. Обновить URL в `tmp/*-proof*.mjs` где есть hardcoded `/qa/legacy-*`.

**Phase 5 DONE когда:**

- [ ] Один хаб для оператора
- [ ] Старые URL только redirect

**Codex review (обязательно):**

- [ ] Scope: full E2E smoke, `tmp/*-proof*.mjs` URL updates
- [ ] Артефакт: `tmp/media-ops-codex-review/phase5-task5.4-review.md`
- [ ] Verdict: `approve` | `approve-with-notes`; нет открытых P1

**Phase 5 gate review (финальный):**

- [ ] `tmp/media-ops-codex-review/phase5-gate-review.md` — все legacy URLs → media-ops

---

## 8. Чеклист «минимум кнопок» (UX приёмка)

| Режим | Max visible primary | В drawer / ▾ |
|-------|---------------------|--------------|
| Inbox orphan | 5 chips + 1 CTA | filters, export, reset |
| Inbox supplement | 3 + 7 role + 3 dup | WW guide, export |
| Assign | pool context actions | copy, download, reset |
| Launch | save + 2 decision + next | bulk, CSV, JSON |
| Shell | tabs + export + save | reset all, migration |

---

## 9. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Регрессия v2 | Phase 1 = wrapper only; smoke `data-v2-*`; `payload.assignment` parity |
| v2 ↔ media-ops coupling | v2 не импортирует media-ops; bridge через `legacy-board-v2-shell-bridge.ts` |
| Потеря localStorage | migration banner + dual-write (Phase 6) |
| emergency-fix approval pack path | не менять `emergency-fix-repo-root.ts` |
| Inbox 2000+ rows | master-detail, P0 default, virtual list при необходимости |
| Scope creep | Launch только Phase 5 |
| Typecheck errors в qa | `tsc --noEmit` scoped на storefront после каждой phase |
| Пропуск review / whole-repo noise | §7.0 scoped MCP; артефакт per task; phase gate |
| Игнор findings Codex | §7.0 цикл remediation; P1 блокирует done; эталон `remediation-log.md` |

---

## 10. Команды для оператора

### Media Ops (Assign + Inbox)

```bash
cd apps/storefront
FURNITURE_REPO_ROOT=/path/to/furniture-commerce yarn dev --port 3002
```

Открыть: http://localhost:3002/qa/media-ops/assign

### Launch (matrix, если отдельный порт)

```bash
cd apps/storefront
FURNITURE_REPO_ROOT=/path/to/furniture-commerce npx next dev --port 3004
```

Открыть: http://localhost:3004/qa/media-ops/launch

---

## 11. Первый тикет для Cursor (copy-paste)

```text
Woodright — Media Ops Phase 2

Repo: furniture-commerce
Read: docs/operator/media-ops-implementation-plan.md (Phase 2 only + §7.0 Codex gate)
Phase 1: done — /qa/media-ops/assign is daily driver

Extract orphan panel from SourceMediaOrphanReviewClient → inbox master-detail.
Не трогать Assign/Launch, normalized, backend, DB.
Foreground: smoke inbox orphan tab + triage export stub.

После каждого Task 2.x (строгий порядок — §7.0):
1. smoke foreground
2. scoped Codex review → tmp/media-ops-codex-review/phase2-task2.x-review.md
3. прочитать отчёт → СРАЗУ имплементировать P1/P2 в коде → remediation.md (finding → fix)
4. повторный smoke; re-review если был request-changes / остались P1
5. ТОЛЬКО ПОТОМ Woodright report packet (FORMAT A) с ## Codex CLI reviewer + что исправлено
6. task → done только при approve | approve-with-notes без открытых P1

Запрещено: report packet между шагами 2 и 3–4.

No commit unless asked.
```

---

## 12. История документа

| Дата | Изменение |
|------|-----------|
| 2026-06-17 | Первая версия плана |
| 2026-06-17 | Codex review remediation: wrapper export (`assignment` parity), v2↔media-ops decoupling, drawer a11y, highlight pulse, smoke matrix; Phase 1 marked done |
| 2026-06-17 | §7.0 + обязательный Codex review на каждый task и phase gate; артефакты `tmp/media-ops-codex-review/` |
| 2026-06-17 | §7.0 цикл remediation: прочитать отчёт → исправить предложенное → remediation.md → re-review |
| 2026-06-17 | Phase 2 Task 2.1 done: orphan panel extract, media-ops-session orphan slice, Codex P2 remediated |
| 2026-06-17 | §7.0 hard rule: findings имплементируются сразу после Codex review; report packet только после remediation + smoke |
| 2026-06-17 | §3 legacy sources re-sorted (Codex): enriched `LEGACY_STORAGE_SOURCES`, +business gate key, importOrder metadata |
| 2026-06-18 | Cross-audit legacy site × Yandex × price list; stats script; P1 audit pack blocker documented |
