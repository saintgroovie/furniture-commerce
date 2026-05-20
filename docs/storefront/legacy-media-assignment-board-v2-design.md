# Legacy Media Assignment Board v2 — Design Document

> **Тип:** design-only (без изменений runtime)  
> **Дата:** 2026-05-20  
> **Worktree:** `furniture-commerce-emergency-fix`  
> **Route (planned):** `/qa/legacy-media-assignment-board-v2`  
> **Deliverable:** только этот файл в `docs/storefront/`

---

## Verdict: design-only

Проект v2 спроектирован как отдельный маршрут рядом со старой бордой `/qa/legacy-media-assignment-board`. Старая борда не изменена, не удалена, не затронута.

**Не менялось (design pass):**

- storefront runtime — `apps/storefront/src/...`, включая v1 board;
- backend, Medusa core, seed, ingestion, `catalog-scope.ts`.

**Создано для фиксации решения:**

- `docs/storefront/legacy-media-assignment-board-v2-design.md` (этот документ).

Содержание: архитектура, UX-модель, preview strategy, план из 4 коммитов, риски, recommendation. Реализация route v2 — отдельные задачи (§7).

---

## Контекст

Старая борда `/qa/legacy-media-assignment-board` дошла до плохого состояния:

- много `preview failed`;
- детали / lifestyle / scheme теряются;
- suggested colors показывают превью ненадёжно;
- media pool перегружен;
- default photos и active gallery живут раздельно;
- drag/drop ненадёжен;
- много кнопок без понятного операторского flow;
- rollback к `52c807b` вернул baseline, но не решил продуктовую проблему.

**Решение:** спроектировать новую route/component рядом — `/qa/legacy-media-assignment-board-v2`.

---

## 1. Что переиспользуем из старой борды

### Data loading — переиспользуем полностью

API-маршруты v1 (`/qa/legacy-media-assignment-board/api/inventory`, `/api/candidates`, `/api/products`) возвращают стабильный JSON. V2 читает те же API без создания новых route handlers.

### Preview resolver — переиспользуем `resolveLegacyMediaBoardPreview`

Функция в `apps/storefront/src/lib/qa/legacy-media-assignment-preview.ts` уже реализует 5-шаговый waterfall. В v2 вызывается напрямую, без дублирования логики.

### Recovery map — переиспользуем `loadLegacyMediaPreviewRecoveryMap`

`data/normalized/legacy-media-preview-recovery-map.json` читается через уже существующий loader. V2 использует его без изменений.

### Export schema — переиспользуем `buildExportDocument`

Функция в `legacy-media-board-export.ts` производит v2-совместимый JSON. V2 добавит только `board_version: "v2board"` в `review_meta`.

### localStorage migration — переиспользуем `parsePersisted` / `migrateV1ToV2`

Если у оператора есть v1-решения, v2 может их прочитать через уже написанный migrator и предложить импортировать в новое пространство имён.

### Role system — переиспользуем полностью

Все типы и хелперы остаются без изменений:

- `VisualRole` (`closed_front | hero_front | front_anfas | front_3_4 | interior | detail | lifestyle | scheme | unknown`)
- `GALLERY_ROLE_SLOT_DEFS` (6 слотов: анфас, 3/4, внутри, деталь, lifestyle, схема)
- `OPERATOR_ROLE_MENU_CHOICES` (8 вариантов назначения)
- `buildGalleryRoleSlotAssignment` — строит слотовую раскладку галереи
- `resolveEffectiveMediaRole` — учитывает ручные override + авто-классификацию
- `classifyVisualRole` — авто-угадывание роли по filename/path
- `VISUAL_ROLE_BADGE_RU` / `OPERATOR_ROLE_LABEL_RU` — русские метки ролей

### Color grouping / enrichment — переиспользуем

`buildLegacyColorArticleIndex`, `scanIndexedArticlesForSuggestions`, `buildUnifiedColorChips` — вся логика цветовой группировки работает через стабильные хелперы.

### Operator role overrides — переиспользуем

`parseOperatorRoleOverrides`, `OPERATOR_ROLE_OVERRIDES_LS_FIELD` — v2 хранит перебиения ролей в своём собственном LS-ключе, но логика разбора идентична.

### Preview proxy route — переиспользуем

`/qa/legacy-media-assignment-board/preview?rel=...` — v2 может использовать тот же маршрут. Allowlist в `LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES` не меняется.

### `flattenToV1Assignments` / `flattenVariantDecisionsToV1Assignments` — переиспользуем

Обратная совместимость экспорта. V2 добавляет только `board_version` поле.

### `dedupeAndSortVariantMedia` — переиспользуем

Дедупликация pool по `duplicate_group_key` и `content_quick_hash` — готова.

### `resolveVariantDisplayLabel` / цветовые метки — переиспользуем

Весь `legacy-color-variant-labels.ts` переиспользуется как есть.

---

## 2. Что НЕ переносим

### Drag/drop как primary interaction

В v1 drag/drop — основной путь назначения. Это привело к:

- `DevDiagnostics` с 15 полями для отладки одного action
- `payloadWritten` / `lastDragAction` / `dragError` — половина state для отладки DnD
- Ненадёжность в Chrome/Safari на touch-мобильных

В v2: **кнопки — primary**. Drag/drop — необязательный бонус, добавляется в Commit 4 если потребуется.

### Одна 6 900-строчная монолит-компонента

`LegacyMediaAssignmentBoardClient.tsx` содержит разметку, логику, стили, типы, диагностику, все модальные состояния — в одном файле. В v2 — разбивка на 5–7 компонент с явными props.

### Giant role-slot columns

В v1 `GALLERY_ROLE_SLOT_DEFS` рендерятся как горизонтальные колонки шириной во весь экран. При 6 слотах layout разваливается. В v2 слоты — checklist-строки в workspace, не колонки.

### Sticky sidebars, ломающие layout

В v1 левая и правая колонки `position: sticky` c `overflow-y: auto` конкурируют со scrollable центром. В v2 — честный CSS Grid с `height: 100dvh` и `overflow-y: scroll` на каждой колонке.

### `preview failed` без объяснения

В v1 карточка показывает пустой блок или «Unpreviewable» без разницы между:

- файл не найден на диске (`file_missing`)
- Yandex/внешний путь без локального бинаря (`unpreviewable_external_ref`)
- repo root не резолвится (`repo_unresolved`)

В v2 каждый из этих статусов имеет явный человекочитаемый ярлык.

### Скрытые detail/lifestyle/scheme

В v1 эти роли могут упасть в overflow или быть скрыты за вкладками. В v2 — `MissingRoleStrip` всегда виден в центре workspace над кнопкой экспорта.

### Слишком много равнозначных кнопок

В v1 на каждой карточке: drag handle, «set primary», «gallery», «ref», «reject», «global reject», «role menu», «inspect» — 8 action-точек одного визуального веса. В v2: одна primary action по контексту + secondary actions в collapse.

### Ambiguous «Details» / «Inspect»

В v1 две кнопки с похожим смыслом. В v2 — «Просмотр» открывает lightbox, «Инспектор» открывает metadata panel. Одна кнопка на карточке.

### Хаотичные suggested colors

В v1 suggested colors — отдельный блок с неявным порядком. В v2 — цветовые варианты как табы над workspace, упорядоченные по статусу (заполнен / частично / пусто).

### Dev Debug panel как постоянный элемент

В v1 `Debug / Diagnostics` всегда в DOM (просто свёрнут). В v2 — debug вынесен в URL-параметр `?debug=1` и рендерится только в dev mode.

---

## 3. Новая UX-модель экрана

### Общая структура: CSS Grid `3 колонки × 1 строка`

```
[Левая панель 280px] | [Центр flex-1] | [Правая панель 360px]
```

Высота: `100dvh`. Все три колонки `overflow-y: scroll` независимо.

---

### Левая колонка — Product selector

```
┌─────────────────────────────────┐
│ 🔍 Поиск продуктов              │
│ ─────────────────               │
│ ▼ Greenwich (12)                │
│   ● sofa-soho-gw    ✓ ready     │
│   ● chair-arc-gw    ⚠ 2 missing │
│   ○ table-rio-gw    — empty     │
│ ▼ Oliver (8)                    │
│   ...                           │
│ ─────────────────               │
│ Filters: all | ready | missing  │
└─────────────────────────────────┘
```

**Элементы:**

- Поиск (filter by handle/title/SKU)
- Коллекция → продукты accordion
- Каждый продукт: status pill — `✓ ready` / `⚠ N missing` / `— empty`
- Фильтр по статусу: all / ready / has missing / empty
- Click → выбирает продукт и загружает workspace

---

### Центр — Product workspace

```
┌──────────────────────────────────────────────┐
│ sofa-soho-gw · Greenwich · SKU GW-01         │
│ ─────────────────────────────────────────────│
│ ЦВЕТ: [Серый ●] [Бежевый ●] [Синий ●]       │  ← color variant tabs
│ ─────────────────────────────────────────────│
│ ┌──────────────┐  ROLE CHECKLIST             │
│ │              │  ✓ Главное фото             │
│ │   MAIN PHOTO │  ✓ 3/4                      │
│ │   (preview)  │  ✗ Деталь          [+ Add]  │
│ │              │  ✗ Lifestyle        [+ Add]  │
│ └──────────────┘  ✓ Схема                    │
│                   ? Анфас          [+ Add]    │
│ ─────────────────────────────────────────────│
│ ГАЛЕРЕЯ (3/4, Внутри, Деталь, ...)           │
│ [img] [img] [img] [img]  + 2 borrowed        │
│ ─────────────────────────────────────────────│
│ ⚠ MISSING: Деталь · Lifestyle               │  ← MissingRoleStrip
│ ─────────────────────────────────────────────│
│ [Export JSON] [Copy] [Download] [Clear] [Reset] │
└──────────────────────────────────────────────┘
```

**Product header:** handle, collection, SKU, confidence score для текущего цвета.

**Color variant tabs:** каждый цвет — кликабельный таб. Статус закрашен: зелёный (все роли заполнены), жёлтый (частично), серый (пусто). При клике — workspace переключается на этот цвет.

**Main image + role checklist:** слева preview главного фото (кликабельный для замены). Справа — checklist из 6 ролей. Каждая строка:
- Иконка статуса (✓ / ✗ / ?)
- Название роли
- Preview thumbnail (если заполнена)
- Кнопка `[+ Add]` → фокусирует правую панель на нужной роли

**Gallery strip:** горизонтальная лента назначенных фото с подписью роли. Клик на фото → highlight в правой панели + allow reassign.

**MissingRoleStrip:** всегда виден. Список незаполненных ролей с quick-add buttons.

**Export bar:** стандартный toolbar внизу workspace. Не в top bar.

---

### Правая колонка — Media pool

```
┌──────────────────────────────────────────────┐
│ Media pool · sofa-soho-gw · Серый            │
│ ─────────────────────────────────────────────│
│ [Все] [Фронт] [3/4] [Деталь] [Lifestyle]    │
│ [Схема] [Цвет] [Unpreviewable] [Rejected]    │
│ ─────────────────────────────────────────────│
│ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │ img    │ │ img    │ │ ✕ нет  │             │
│ │ фронт  │ │ деталь │ │ Yandex │             │
│ │ high   │ │ medium │ │        │             │
│ │ [Main] │ │[Детал] │ │[Inspect]│            │
│ └────────┘ └────────┘ └────────┘             │
└──────────────────────────────────────────────┘
```

**Pool header:** указывает выбранный продукт и цвет. Если ни один не выбран — «Выберите продукт».

**Role filter tabs:** фильтруют пул по угаданной роли. Tab `Unpreviewable` показывает карточки с `preview_status ≠ ok`. Tab `Rejected` — отклонённые этим продуктом.

**Pool limit:** отображается счётчик `Showing N of M`. Для `M > 120` появляется кнопка «Показать ещё 60».

---

### Топ-бар (минимальный)

```
Woodright Legacy Media Board v2 · [продукт: sofa-soho-gw] · [export JSON] [reset v2]
```

Только заголовок + breadcrumb + глобальный export и reset. Без дублирования action из workspace.

---

## 4. Новая модель media card

### Структура карточки

```
┌──────────────────────────────────┐
│ ┌─────────┐   filename.jpg       │
│ │         │   Деталь · high      │
│ │ preview │   front · white-bg   │
│ │  (или   │   ● color match: Серый│
│ │  ✕ nope)│                      │
│ └─────────┘                      │
│ [Set main] [+ Gallery] [Деталь▼] │
│ [+ All colors] [Inspect] [✕]     │
└──────────────────────────────────┘
```

### Поля карточки

| Поле | Источник | Отображение |
|------|----------|-------------|
| **preview** | `resolveLegacyMediaBoardPreview` | img или status icon |
| **preview_status** | resolver → `preview_status` | иконка: ✓ / ↩ / ⚠ / ✕ |
| **role_guess** | `classifyVisualRole(inv, {productHandle, productSku})` | бейдж роли (рус.) |
| **confidence** | `CandidateEntry.confidence` | `high/medium/low` |
| **source_type** | `InvItem.source_type` | `front · white-bg / downloaded / pdf-extract / ...` |
| **color_match** | `resolveEffectiveMediaRole` + color token сравнение | цвет + метка |
| **filename** | `InvItem.filename` | truncated, full в tooltip |

### Actions

**Primary (всегда видны):**

- **`Set main`** — устанавливает как `primary` для текущего цвета. Если уже primary — меняется на `Remove from main`. Disabled если не выбран продукт.
- **`+ Gallery`** — добавляет в `gallery` текущего цвета. Кнопка меняется на `✓ В галерее` если уже добавлена.
- **`[роль] ▼`** — dropdown из `OPERATOR_ROLE_MENU_CHOICES`. Выбор роли — override для этого media id. Текущая угаданная роль отображается на кнопке.

**Secondary (в collapse или при наведении):**

- **`+ All colors`** — добавляет в галерею всех цветовых вариантов продукта. Показывает счётчик: `+ 3 colours`.
- **`Inspect`** — открывает metadata panel (или lightbox) с полным набором полей InvItem + CandidateEntry.
- **`✕`** (Reject) — добавляет в `lane_rejected` для текущего продукта. Меняется на `↩ Restore` после отклонения.

### Состояния карточки

- `assigned` (primary/gallery) — highlighted border + filled action button
- `unpreviewable` — preview area = статусный блок с причиной
- `recovered` — preview виден, recovery badge в углу (`recovered preview · exact`)
- `rejected` — затемнённая, кнопка `↩ Restore`
- `color-mismatch` — subtle warning badge если color token не совпадает с активным вариантом

---

## 5. Preview reliability strategy

### Почему сейчас preview failed

**Причина 1 — Yandex/внешние пути.**
Большинство файлов в `legacy-media-inventory.json` имеют `source_path` вида `/WOODRIGHT/...` или `/Volumes/...` — Yandex Disk mount на локальной машине разработчика. Когда Yandex не примонтирован, `fileExistsUnderRepo` возвращает `false`, resolver возвращает `unpreviewable_external_ref`, карточка показывает пустой блок.

**Причина 2 — Docker path mismatch.**
В Docker storefront работает в `/app/`, но `FURNITURE_REPO_ROOT` может не быть задан. `repo_unresolved` — следствие этого.

**Причина 3 — file_missing для data/ путей.**
Файл есть в inventory, путь allowlisted (`data/raw/downloaded-assets/...`), но файла физически нет в repo — скачан в Yandex, не закоммичен.

**Причина 4 — Recovery map не загружен.**
`legacy-media-preview-recovery-map.json` может не существовать или быть устаревшим.

**Причина 5 — Нет визуального различия статусов.**
В v1 все 5 типов failure рендерятся как пустой блок. Оператор не понимает, почему фото не видно.

---

### Единый 5-уровневый waterfall в v2

```
Level 1: working absolute URL
  → /static/... → http://localhost:9000/static/...
  → http(s)://... → direct img

Level 2: repo/static preview (backend_static_mapped)
  → apps/backend/static/* → localhost:9000/static/*

Level 3: board proxy (/preview?rel=...)
  → data/raw/downloaded-assets/...
  → data/processed/storefront-assets/...
  → data/raw/front/...
  → data/raw/pdf-assets/...
  → data/raw/assets/...
  (только если файл физически существует на диске)

Level 4: recovery map
  → data/normalized/legacy-media-preview-recovery-map.json
  → recovered_exact / recovered_basename / recovered_pdf_extract / recovered_duplicate_group

Level 5: explicit failed state
  → file_missing → «Файл не найден в репо»
  → unpreviewable_external_ref → «Yandex/внешний путь»
  → repo_unresolved → «Корень репо не определён»
  → no_source → «Путь не задан»
```

### Таблица статусов preview в v2

| `preview_status` | Причина | Иконка | Action hint |
|------------------|---------|--------|-------------|
| `backend_static_url` | URL → Medusa static, работает | ✓ | — |
| `local_proxy` | файл есть в repo data/ | ✓ | — |
| `recovered_*` | найден через recovery map | ↩ | badge с типом recovery |
| `remote_http` | прямой http URL | ✓ | — |
| `file_missing` | data/ allowlisted, файл отсутствует на диске | ⚠ | «Скачайте или примонтируйте Yandex» |
| `unpreviewable_external_ref` | Yandex/Volumes path, нет локального бинаря | 🔗 | «Только при монтировании Yandex» |
| `repo_unresolved` | `FURNITURE_REPO_ROOT` не задан | ⚙ | «Проверьте env» |
| `no_source` | `source_path` и `repo_relative_path` пусты | ✕ | «Нет пути в inventory» |

### Как v2 работает без preview

Если preview невозможен (Yandex path), карточка всё равно отображается в пуле с:
- иконкой 🔗 + filename.jpg
- role_guess, confidence, source_type — все metadata видны
- Actions: `Set main`, `+ Gallery`, role dropdown — работают (id-based, preview-independent)

Оператор может назначить Yandex-файл по ID, не видя preview. После монтирования Yandex — preview появится при обновлении страницы.

---

## 6. Export compatibility

### Можно ли сохранить текущую схему

Да. `buildExportDocument` в `legacy-media-board-export.ts` производит v2-схему, которую можно расширить без breaking change.

### Поля, которые нужно добавить в v2

```jsonc
{
  "version": 2,
  "exported_at": "...",
  "review_meta": {
    "scope": "legacy_media_assignment_board",
    "board_version": "v2board",
    "schema": "legacy_media_assignment_v2",
    "local_dev_only": true,
    "production_rollout": false
  },
  "products": [
    {
      "handle": "sofa-soho-gw",
      "sku": "GW-01",
      "collection": "greenwich",
      "active_variant_key": "grey",
      "primary_candidate": "inv_id_123",
      "gallery_candidates": ["inv_id_456", "inv_id_789"],
      "reference_only": [],
      "rejected": [],
      "role_assignments": {
        "grey": {
          "main": "inv_id_123",
          "front_anfas": null,
          "front_3_4": "inv_id_456",
          "interior": null,
          "detail": null,
          "lifestyle": null,
          "scheme": null
        }
      }
    }
  ],
  "global_rejections": [],
  "legacy_assignments_v1_flat": [...]
}
```

**Поле `role_assignments`** — новое. Хранит явные role-slot assignments per product per color. Позволяет downstream executor применить фото с точным знанием роли.

### Как не сломать старые decisions

- `legacy_assignments_v1_flat` остаётся — старые executors работают без изменений.
- `version: 2` — не меняется.
- `review_meta.board_version` — новое поле, игнорируется старыми readers.

### localStorage key v2 (изолированный namespace)

```
furniture-legacy-media-assignment-decisions-v2board
furniture-legacy-media-assignment-variants-v2board
furniture-legacy-article-scan-v2board
```

Суффикс `v2board` не конфликтует с:
- `furniture-legacy-media-assignment-decisions-v1` (v1 decisions)
- `furniture-legacy-media-assignment-decisions-v2` (v2 decisions из v1-борды)

При первом запуске v2-борды: если `v2board` LS не найден — предложить миграцию из `v2` через `parsePersisted` + диалог «Импортировать решения из v1?».

---

## 7. Implementation plan

### Commit 1 — Route + skeleton + data loading + preview resolver

**Что делаем:**
Создаём пустую route `/qa/legacy-media-assignment-board-v2` с загрузкой данных через те же API v1 и правильной структурой preview-резолвера.

**Files likely touched:**
```
apps/storefront/src/app/qa/legacy-media-assignment-board-v2/
  page.tsx                         ← route entry, metadata
  LegacyMediaBoardV2Client.tsx     ← client shell, useEffect data loading
  legacy-board-v2-types.ts        ← V2BoardState, V2RoleSlot, V2ProductState
  legacy-board-v2-preview.ts      ← re-exports + helper clientPreviewUrl v2
```

**Reused without copy:**
- `LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES` из `legacy-media-assignment-preview.ts`
- API base: `/qa/legacy-media-assignment-board/api` (те же v1 маршруты)
- Preview proxy: `/qa/legacy-media-assignment-board/preview` (тот же маршрут)

**Validation:**
- `curl http://localhost:3000/qa/legacy-media-assignment-board-v2` → 200
- `curl /qa/legacy-media-assignment-board/api/inventory` → JSON с `items[]`
- Console: нет ошибок fetch

**Browser proof:**
- Route открывается
- В Network tab: три успешных API запроса
- State: products loaded, inventory loaded, candidates map built

**Commit message:**
```
feat(qa): add legacy-media-assignment-board-v2 route skeleton

Empty board shell at /qa/legacy-media-assignment-board-v2 with data
loading from v1 API routes (inventory, candidates, products) and
unified preview resolver types. No UI components yet.
```

---

### Commit 2 — Media cards + source pool + role filters

**Что делаем:**
Правая панель полностью работает: карточки с preview, статусами, role guess, primary actions.

**Files likely touched:**
```
apps/storefront/src/app/qa/legacy-media-assignment-board-v2/
  MediaCardV2.tsx      ← одна карточка (preview + role + actions)
  MediaPoolPanel.tsx   ← правая колонка, role filter tabs, pool list
  RoleFilterTabs.tsx   ← tab strip с role badges
```

**Reused without copy:**
- `resolveEffectiveMediaRole` из `legacy-board-operator-role-overrides.ts`
- `classifyVisualRole` из `legacy-media-visual-role-ranking.ts`
- `OPERATOR_ROLE_MENU_CHOICES`, `GALLERY_ROLE_SLOT_DEFS`
- `VISUAL_ROLE_BADGE_RU`, `OPERATOR_ROLE_LABEL_RU`
- `clientPreviewUrl` (адаптированный wrapper из шага 1)

**Validation:**
- Карточки рендерятся для выбранного продукта
- Role filter tabs: клик на «Деталь» — в пуле только detail-карточки
- Preview: ✓ для previewable файлов, иконка статуса для остальных
- Actions: кнопки видны, click не throws

**Browser proof:**
- Открыть продукт → right panel shows pool
- Filter «Unpreviewable» → показывает карточки с preview_status labels
- Filter «Деталь» → показывает только `detail` role cards

**Commit message:**
```
feat(qa/v2): add media pool panel with role-aware cards and status icons

MediaCardV2: preview waterfall status icons, role guess badge, primary
actions (Set main, + Gallery, role dropdown, Inspect, Reject).
MediaPoolPanel: role filter tabs, pool list with per-role counts.
No drag/drop — button-only interaction.
```

---

### Commit 3 — Active color workspace + role assignment + missing roles

**Что делаем:**
Центральная колонка с role checklist, color tabs, MissingRoleStrip, gallery strip.

**Files likely touched:**
```
apps/storefront/src/app/qa/legacy-media-assignment-board-v2/
  ProductWorkspace.tsx     ← центр: header + tabs + checklist + gallery
  ColorVariantTabs.tsx     ← color tabs со статусами (зелёный/жёлтый/серый)
  RoleChecklistPanel.tsx   ← 6-строчный checklist с CTA
  MissingRoleStrip.tsx     ← prominent missing-roles bar
  GalleryStrip.tsx         ← горизонтальная лента назначенных фото
```

**Reused without copy:**
- `buildGalleryRoleSlotAssignment` из `legacy-board-operator-role-overrides.ts`
- `sortGalleryByEffectiveRoles`
- `buildColorIssueChecklist` из `legacy-board-color-workspace.ts`
- `buildUnifiedColorChips`
- `resolveVariantDisplayLabel` из `legacy-color-variant-labels.ts`
- `computeSkuReviewProgress` из `legacy-board-operator-polish.ts`

**Validation:**
- Выбрать продукт → workspace показывает 6 role slots
- Клик «Set main» на карточке в пуле → main photo обновляется в checklist
- Нажать «+ Add» в missing role строке → правая панель фокусируется на этой роли
- MissingRoleStrip: обновляется после каждого assignment

**Browser proof:**
- Полный workflow: выбрать продукт → выбрать цвет → назначить main → добавить в gallery → увидеть checklist
- MissingRoleStrip исчезает по мере заполнения ролей
- Color tabs меняют цвет статуса

**Commit message:**
```
feat(qa/v2): add product workspace with role checklist and missing-role strip

ColorVariantTabs: per-color status (filled/partial/empty).
RoleChecklistPanel: 6-role checklist with CTA to focus pool.
MissingRoleStrip: always-visible strip of unfilled roles.
GalleryStrip: assigned gallery with role labels. Button-only assignment.
```

---

### Commit 4 — Export + persistence + browser proof script

**Что делаем:**
localStorage persistence, export JSON, copy/download, reset, migration prompt из v1.

**Files likely touched:**
```
apps/storefront/src/app/qa/legacy-media-assignment-board-v2/
  legacy-board-v2-export.ts       ← buildV2ExportDocument (extends buildExportDocument)
  legacy-board-v2-persistence.ts  ← LS read/write с v2board-namespace
  ExportToolbar.tsx               ← кнопки Export / Copy / Download / Reset
  MigrationPrompt.tsx             ← диалог импорта из v1 LS (опционально)
```

**Reused without copy:**
- `buildExportDocument` из `legacy-media-board-export.ts` (+ `board_version` поле)
- `parsePersisted` / `migrateV1ToV2` (для migration prompt)
- `flattenToV1Assignments` / `flattenVariantDecisionsToV1Assignments`

**localStorage keys:**
```
furniture-legacy-media-assignment-decisions-v2board
furniture-legacy-media-assignment-variants-v2board
furniture-legacy-article-scan-v2board
```

**Validation:**
- Назначить фото → localStorage сохраняется → refresh → решения восстанавливаются
- Export → валидный JSON с `board_version: "v2board"` и `role_assignments`
- Copy → clipboard content = JSON
- Download → `.json` файл скачивается
- Reset → очищает только v2board LS namespace, не трогает v1

**Browser proof:**
```
DevTools → Application → localStorage
  key: furniture-legacy-media-assignment-decisions-v2board
  value: {version:2, review_meta: {board_version:"v2board"}, ...}
```

**Commit message:**
```
feat(qa/v2): add export, localStorage persistence, and migration from v1

V2board localStorage namespace isolated from v1 decisions.
Export adds role_assignments per variant. Copy/Download/Reset controls.
Optional migration prompt reads v1 decisions via parsePersisted.
```

---

## 8. Risks

### Preview paths

**Риск:** `/qa/legacy-media-assignment-board/preview?rel=...` — allowlist задан для v1. V2 использует тот же маршрут, но если изменится `FURNITURE_REPO_ROOT` env или docker volume mapping — preview сломается для обеих борд одновременно.

**Митигация:** В v2 добавить env-check при инициализации: если `FURNITURE_REPO_ROOT` не задан — показывать banner «Preview proxy may not work» в top bar.

### localStorage migration

**Риск:** Если оператор работал в v1 борде и накопил решения в `furniture-legacy-media-assignment-decisions-v2`, v2board не импортирует их автоматически.

**Митигация:** `MigrationPrompt` при первом запуске — читает v1 LS, предлагает импортировать. Миграция одноразовая, решения копируются, v1 LS остаётся нетронутым.

### Export compatibility

**Риск:** Новое поле `role_assignments` в export JSON — downstream executor (`apply-mvp-media-assignments.ts`) не ожидает его.

**Митигация:** Поле добавляется как optional. `legacy_assignments_v1_flat` остаётся полным. Executor работает по нему без изменений.

### Performance на 3000+ media

**Риск:** `legacy-media-inventory.json` может содержать 3000+ записей. Если v2 загружает весь пул сразу — первый render медленный.

**Митигация:**
- Pool cap: `POOL_LIMIT = 120` (как в v1) с пагинацией «Показать ещё 60»
- Первичная фильтрация: candidates только для выбранного handle
- `useMemo` для filtered pool
- Inventory map строится один раз: `Map<id, InvItem>`

### Accidental Medusa writes

**Риск:** V2 борда — read-only / QA tool. Нет пути к Medusa API.

**Митигация:**
- Нет импорта из `apps/storefront/src/lib/api/` в v2 компонентах
- Нет кнопок, триггерящих POST/PATCH к Medusa
- Export — только JSON download/copy, без network request к backend

### Parent repo safety

**Риск:** Worktree `furniture-commerce-emergency-fix` — изолированное рабочее дерево. Случайный `git push` или `git cherry-pick` может затронуть parent.

**Митигация:**
- Design pass не трогал runtime; только docs в `docs/storefront/`
- Worktree изолирован от parent repo; push — по явному запросу

---

## 9. Recommendation

### Вывод: Rebuild v2 рядом, не чинить v1 как основной путь

**Причины:**

1. V1 — 6 900-строчный монолит. Каждое исправление потенциально ломает что-то в другом месте той же функции. Это уже произошло: rollback к `52c807b` потребовался именно потому, что правки накопились до нерабочего состояния.

2. Основная проблема v1 — не баги в конкретных местах, а **архитектурная** — drag/drop как primary interaction в среде, где preview ненадёжен. Нельзя починить drag/drop, если 60%+ медиа не имеют preview. Нельзя починить preview для Yandex-файлов без монтирования.

3. V2 решает продуктовую проблему: оператор может работать **без preview** — назначать роли по filename + role_guess + metadata, видеть checklist, экспортировать решения. Preview — приятный бонус, не блокер.

4. V2 не ломает v1. Оба маршрута живут рядом. Переход постепенный.

### Когда v1 можно оставить

V1 останется как fallback. Если оператор привык к нему — пусть работает. V2 предлагается как основной инструмент для новых сессий.

### Минимальный первый implementation prompt

```
Задача: Commit 1 из v2 implementation plan.
Worktree: /Users/leonidmbp/Documents/projects/furniture-commerce-emergency-fix
Route: /qa/legacy-media-assignment-board-v2

Создай только:
1. apps/storefront/src/app/qa/legacy-media-assignment-board-v2/page.tsx
   — Next.js page с metadata, рендерит <LegacyMediaBoardV2Client />

2. apps/storefront/src/app/qa/legacy-media-assignment-board-v2/LegacyMediaBoardV2Client.tsx
   — "use client"; loading state; три useEffect: fetch /api/inventory, /api/candidates, /api/products
   — base URL: /qa/legacy-media-assignment-board/api (те же v1 маршруты)
   — state: products[], invById: Map<id, InvItem>, candidatesById: Map<id, CandidateEntry>
   — рендер: skeleton loader → «N products, M inventory items loaded»

3. apps/storefront/src/app/qa/legacy-media-assignment-board-v2/legacy-board-v2-types.ts
   — V2BoardState: selectedHandle, activeVariantKey, variantsByHandle (role assignments)
   — re-export InvItem, CandidateEntry, ProductRow из v1 types

Не трогай:
- старую борду
- backend, seed, catalog-scope.ts, parent repo

Не коммить.
```

---

## Appendix: design-session record (2026-05-20)

Краткая фиксация исходного design pass (до коммита этого файла). Для handoff в ChatGPT — копировать §1–§9 выше; этот appendix не дублирует Woodright packet из чата.

| Область | Статус design pass |
|---------|-------------------|
| Runtime / v1 board | не изменялись |
| Backend / seed / Medusa | не трогались |
| Единственный артефакт | этот design doc |
| Следующий шаг | Commit 1 реализации (§7, §9) |
