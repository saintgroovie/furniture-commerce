# Docs — целевая структура папок (IA)

Цель: предсказуемые якоря для AI и людей; стабильные пути для guardrails (`guidelines/`, `architecture/`, `project/CODEMAP.md`).

## Дерево верхнего уровня

Правило корня: в **`docs/`** на верхнем уровне держим **только** `README.md` (оглавление). Все тематические `.md` — в подпапках ниже.

```text
docs/
├── README.md                 # Оглавление и ссылки (единственный .md в корне)
├── guidelines/               # Правила разработки и продукта (без изменения роли)
├── architecture/             # Системная архитектура, API, data model, guardrails
├── project/                  # PRD, статус, CODEMAP, AI prompts, meta отчёты о docs
├── storefront/               # Витрина: UI, phase1, naming, catalog interpretation / display
├── content/                  # Sourcing, mapping, workbook, legacy scrape, fuzzy, очереди ревью
├── assets/                   # Стратегии и планы по ассетам (storage, preprocess, binding, URL)
├── collections/
│   ├── README.md
│   ├── greenwich/            # Все Greenwich-специфичные планы, аудиты, отчёты
│   ├── oliver/               # Зарезервировано (README)
│   └── willie-winkie/        # Зарезервировано (README)
├── ingestion/                # README: куда смотреть за ingestion/seed (по коллекциям)
├── reports/                  # Исполнительные отчёты (общие + assets); без greenwich/
└── content-pipeline/         # Только README → миграция на content/ + assets/
```

## Правила отнесения

| Тип материала | Папка |
|---------------|--------|
| Обязательные dev/product guardrails | `guidelines/` |
| Модель данных, API, границы системы | `architecture/` |
| Продукт, этапы, карта кода, промпты | `project/` |
| Next.js storefront, UI, **каталог как на витрине** (`catalog-*`) | `storefront/` |
| Источники контента, маппинг workbook↔legacy↔disk, fuzzy, parser | `content/` |
| Ассеты: файлы, URL, препроцесс, привязка к SKU | `assets/` |
| Один бренд/линейка (Greenwich): ingestion, refresh, seed, display отчёты | `collections/greenwich/` |
| Разовые прогоны, аудиты без привязки к одной коллекции | `reports/` |

## Стабильные якоря (не переименовывать путь файла)

- `docs/guidelines/development-rules.md`
- `docs/architecture/architecture-guardrails.md`
- `docs/project/CODEMAP.md`

## Не делаем

- `docs/archive/` — не вводим, пока нет явного запроса на устаревший массив файлов.
- Дублирование одного и того же файла в двух папках.
