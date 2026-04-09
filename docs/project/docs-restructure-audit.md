# Docs restructure — audit (2026-04-10)

## 1. Сканирование `docs/` (до реорганизации)

### 1.1 Стабильные подпапки (уже тематические)

| Папка | Тема | Замечания |
|--------|------|-----------|
| `guidelines/` | Правила разработки и продукта | Ок; `production-dataset-inclusion-rules.md` логично остаётся здесь (критерии датасета). |
| `architecture/` | Архитектура, API, data model, guardrails | Ок. |
| `project/` | PRD, статус, CODEMAP, AI prompts | Ок. |
| `storefront/` | Витрина Phase 1, UI, naming | Ок; не хватало рядом **catalog / display interpretation** документов из корня `docs/`. |

### 1.2 Корень `docs/` — «плоские» файлы (проблема)

Смешение тем без папки:

- **Storefront / catalog contract:** `catalog-interpretation-rules.md`, `catalog-target-display-model.md`, `catalog-implementation-gap-audit.md`, `catalog-interpretation-implementation-report.md`.
- **Greenwich (коллекция):** 14+ файлов `greenwich-*.md` (ingestion, seed, refresh, display, bed parity, отчёты).
- **Content / mapping (сквозной):** `entity-mapping-readiness-report.md` (не только Greenwich).

**Паттерн:** префиксы `greenwich-`, `catalog-` вместо навигации по папкам.

### 1.3 `content-pipeline/`

| Часть | Содержимое | Замечания |
|--------|------------|-----------|
| Корень | mapping, sourcing, legacy scrape, fuzzy, workbook, image-map, front-folder | Это **content ops / sourcing**, не «pipeline executable». |
| `assets/` | Стратегии хранения, препроцесс, binding, PDF, disk, URL mapping | Логичная группа **asset pipeline**; имя `content-pipeline/assets` длинное и путается с корнем pipeline. |
| `greenwich/` | download plan, asset preprocess, next actions | По сути **коллекция Greenwich**, не общий pipeline. |

### 1.4 `reports/`

| Часть | Содержимое |
|--------|------------|
| Корень | legacy site, yandex disk, price workbook, fuzzy, front-folder, legacy images |
| `assets/` | Отчёты по ассетам (preprocess, disk, binding, pdf, production subset) |
| `greenwich/` | Отчёты по Greenwich preprocess, beds, legacy images, unresolved |

**Проблема:** отчёты по Greenwich оторваны от остальных документов Greenwich в корне `docs/`.

### 1.5 Группировка по темам (целевая логика)

| Тема | Было размазано по |
|------|-------------------|
| Architecture / guardrails | `architecture/` ✓ |
| Project / status / handoff | `project/` ✓ |
| Storefront / UI / display model | `storefront/` + корень `catalog-*` |
| Content / sourcing / mapping | `content-pipeline/` (корень) + частично reports |
| Assets / mapping / disk / URL | `content-pipeline/assets/` + `reports/assets/` |
| Collection Greenwich | корень `greenwich-*` + `content-pipeline/greenwich/` + `reports/greenwich/` |
| Ingestion / seed / refresh | внутри Greenwich-файлов в корне (нет отдельной папки) |
| Guidelines | `guidelines/` ✓ |

### 1.6 Дубли и противоречивый naming

- **Дубли смысла нет** между отдельными файлами с похожими именами; есть **дублирование темы Greenwich** в трёх местах (корень, `content-pipeline/greenwich`, `reports/greenwich`).
- **Несогласованные ссылки внутри отчётов:** часть указывает `docs/foo.md` без `content-pipeline/`, часть — полный путь (исторический drift).
- **Oliver / Willie Winkie:** нет отдельных папок документов; упоминания только внутри catalog / entity-mapping / Greenwich контекста — **отдельные `collections/oliver` и `collections/willie-winkie` завести как зарезервированные** с коротким README, без переноса файлов.

### 1.7 Файлы сознательно не трогаем в этом раунде

- Содержимое `architecture/`, `guidelines/`, `project/` (кроме новых meta-файлов реструктуризации) — **без переписывания текста**.
- `reports/assets/` и общие `reports/*.md` — **остаются** в `reports/` (отчёты vs стратегии в `assets/`).
- Ссылки на несуществующие файлы вне этого дерева (например `docs/MEDUSA_DOCKER_GUIDE.md`) — **не создаём**; фиксируется в отчёте как pre-existing gap.

---

## 2. Вывод аудита

Целесообразно:

1. Ввести **`docs/content/`** и **`docs/assets/`** (стратегии), перенеся туда файлы из `content-pipeline/` без изменения смысла.
2. Собрать весь Greenwich в **`docs/collections/greenwich/`** (включая бывшие `reports/greenwich/` и `content-pipeline/greenwich/`).
3. Перенести **`catalog-*`** в **`docs/storefront/`** рядом с остальной витриной.
4. Оставить **`docs/reports/`** для общих и asset-отчётов; обновить ссылки на новые пути `content/`, `assets/`, `storefront/`, `collections/greenwich/`.
5. Добавить **`docs/ingestion/README.md`** как навигационный указатель (фактические ingestion-доки Greenwich лежат в `collections/greenwich/`).
6. **`docs/content-pipeline/README.md`** — редирект-навигация на новые пути (папку можно оставить пустой кроме README).
