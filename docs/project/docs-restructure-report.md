# Docs restructure — отчёт о выполнении

## 1. Summary

Документация в `docs/` приведена к тематическим верхнеуровневым папкам: контент и ассеты разведены (`content/` vs `assets/`), вся документация **Greenwich** собрана в `collections/greenwich/`, правила интерпретации каталога перенесены в `storefront/` рядом с остальными storefront-доками. Папка `content-pipeline/` сохранена только как **README-редирект**. Ссылки в документах, backend README, `development-rules`, `AI_CONTEXT`, `architecture-guardrails`, `SYSTEM_BOUNDARIES`, `MASTER_PRD`, `CODEMAP` и скриптах обновлены под новые пути. Содержание перенесённых `.md` файлов **не переписывалось** (только пути в ссылках).

## 2. Target folder structure (фактическое состояние)

```text
docs/
├── README.md
├── guidelines/
├── architecture/
├── project/          # + docs-restructure-*.md, docs-target-structure.md
├── storefront/       # + catalog-*.md
├── content/
├── assets/
├── collections/
│   ├── README.md
│   ├── greenwich/    # все Greenwich *.md
│   ├── oliver/       # README (резерв)
│   └── willie-winkie/# README (резерв)
├── ingestion/        # README (навигация)
├── reports/          # без подпапки greenwich/
└── content-pipeline/ # только README (редирект)
```

Стабильные якоря неизменны по смыслу:

- `docs/guidelines/development-rules.md`
- `docs/architecture/architecture-guardrails.md`
- `docs/project/CODEMAP.md`

## 3. Files moved (old path → new path)

### В `docs/storefront/`

| Было | Стало |
|------|--------|
| `docs/catalog-interpretation-rules.md` | `docs/storefront/catalog-interpretation-rules.md` |
| `docs/catalog-interpretation-implementation-report.md` | `docs/storefront/catalog-interpretation-implementation-report.md` |
| `docs/catalog-target-display-model.md` | `docs/storefront/catalog-target-display-model.md` |
| `docs/catalog-implementation-gap-audit.md` | `docs/storefront/catalog-implementation-gap-audit.md` |

### В `docs/content/` (бывший корень `content-pipeline/`)

| Было | Стало |
|------|--------|
| `docs/content-pipeline/content-mapping.md` | `docs/content/content-mapping.md` |
| `docs/content-pipeline/content-sourcing-rules.md` | `docs/content/content-sourcing-rules.md` |
| `docs/content-pipeline/asset-mapping-strategy.md` | `docs/content/asset-mapping-strategy.md` |
| `docs/content-pipeline/legacy-scrape-strategy.md` | `docs/content/legacy-scrape-strategy.md` |
| `docs/content-pipeline/fuzzy-promotion-rules.md` | `docs/content/fuzzy-promotion-rules.md` |
| `docs/content-pipeline/manual-review-queues.md` | `docs/content/manual-review-queues.md` |
| `docs/content-pipeline/image-map-notes.md` | `docs/content/image-map-notes.md` |
| `docs/content-pipeline/workbook-parser-notes.md` | `docs/content/workbook-parser-notes.md` |
| `docs/content-pipeline/front-folder-review-strategy.md` | `docs/content/front-folder-review-strategy.md` |
| `docs/entity-mapping-readiness-report.md` | `docs/content/entity-mapping-readiness-report.md` |

### В `docs/assets/` (бывшее `content-pipeline/assets/`)

| Было | Стало |
|------|--------|
| `docs/content-pipeline/assets/*.md` (11 файлов) | `docs/assets/*.md` (те же имена) |

### В `docs/collections/greenwich/`

| Было | Стало |
|------|--------|
| `docs/greenwich-*.md` (14 файлов в корне `docs/`) | `docs/collections/greenwich/greenwich-*.md` |
| `docs/content-pipeline/greenwich/*.md` (3 файла) | `docs/collections/greenwich/*.md` |
| `docs/reports/greenwich/*.md` (4 файла) | `docs/collections/greenwich/*.md` |

Итого в `collections/greenwich/`: 21 markdown-файл (без дубликатов имён).

## 4. Paths updated (где менялись ссылки)

- Массовая замена в `docs/**/*.md` и `scripts/greenwich-scrape.py`: `content-pipeline/` → `content/` или `assets/` или `collections/greenwich/`; `docs/greenwich-*` → `docs/collections/greenwich/greenwich-*`; `docs/catalog-*` → `docs/storefront/catalog-*`; уточнены пути к отчётам в `reports/assets/` и к `guidelines/production-dataset-inclusion-rules.md`.
- **`docs/README.md`** — переписано оглавление под новую IA.
- **`docs/project/CODEMAP.md`** — абзац о структуре каталога `docs/`.
- **`docs/guidelines/development-rules.md`** — список обязательных документов с полными путями.
- **`docs/architecture/SYSTEM_BOUNDARIES.md`** — пути к архитектуре и project-докам.
- **`docs/architecture/architecture-guardrails.md`** — относительные пути к `guidelines/` и `project/`.
- **`docs/project/AI_CONTEXT.md`**, **`docs/project/MASTER_PRD.md`** (одна внутренняя ссылка).
- **`apps/backend/README.md`** — ссылки на `docs/project/`, `docs/architecture/`, `docs/guidelines/`.

Новые файлы навигации: `docs/content-pipeline/README.md`, `docs/ingestion/README.md`, `docs/collections/README.md`, `docs/collections/oliver/README.md`, `docs/collections/willie-winkie/README.md`.

## 5. Файлы оставлены на месте (и почему)

- **`docs/guidelines/`**, **`docs/architecture/`** (кроме правок ссылок) — уже соответствовали роли.
- **`docs/project/`** — PRD, статус, промпты; добавлены только meta-файлы аудита/отчёта реструктуризации.
- **`docs/storefront/`** — существующие storefront-доки не перемещались.
- **`docs/reports/`** и **`docs/reports/assets/`** — отчёты общего и asset-слоя; подпапка **`reports/greenwich/`** удалена как пустая после переноса файлов в `collections/greenwich/`.

## 6. Remaining caveats

- **`docs/MEDUSA_DOCKER_GUIDE.md`** по-прежнему отсутствует в репозитории; ссылки на него в `PROJECT_STATUS.md`, `MASTER_PROMPT.md` оставлены как есть (известный gap).
- Исторические упоминания «content-pipeline» в **`docs/project/docs-restructure-audit.md`** и **`docs/project/docs-target-structure.md`** намеренно описывают **прошлое** состояние — не удалять как «битые ссылки».
- Папка **`docs/ingestion/`** не содержит перенесённых Greenwich-файлов: используется как **навигационный указатель**; фактические ingestion-доки лежат в **`docs/collections/greenwich/`**.
- **`docs/collections/oliver/`** и **`willie-winkie/`** — только README; отдельных коллекционных пакетов документов пока нет.

---

*Связанные meta-документы: [docs-restructure-audit.md](docs-restructure-audit.md), [docs-target-structure.md](docs-target-structure.md).*
