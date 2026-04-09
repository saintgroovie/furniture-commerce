# Документация Woodright Furniture Commerce

Верхний уровень разложен по темам: `project/`, `architecture/`, `guidelines/`, `storefront/`, `content/`, `assets/`, `collections/`, `reports/`. Папка `content-pipeline/` сохранена только с [README](content-pipeline/README.md) (редирект на новые пути). Отчёт о реорганизации: [project/docs-restructure-report.md](project/docs-restructure-report.md).

## project/ — Проект и статус

| Документ | Назначение |
|----------|------------|
| [MASTER_PRD.md](project/MASTER_PRD.md) | Product Requirements Document — видение продукта |
| [MASTER_PROMPT.md](project/MASTER_PROMPT.md) | Системный контекст для Cursor / AI |
| [AI_CONTEXT.md](project/AI_CONTEXT.md) | Snapshot состояния проекта для передачи контекста |
| [AI_CHANGELOG.md](project/AI_CHANGELOG.md) | Журнал архитектурных решений |
| [CODEMAP.md](project/CODEMAP.md) | Карта кода и навигация по репозиторию |
| [PROJECT_STATUS.md](project/PROJECT_STATUS.md) | Текущий статус разработки |
| [phases.md](project/phases.md) | Этапы разработки (Phase 0–6) |
| [mvp-scope.md](project/mvp-scope.md) | Границы MVP |
| [docs-restructure-audit.md](project/docs-restructure-audit.md) | Аудит структуры docs (meta) |
| [docs-target-structure.md](project/docs-target-structure.md) | Целевая IA docs (meta) |
| [docs-restructure-report.md](project/docs-restructure-report.md) | Отчёт о переносах и ссылках (meta) |

## architecture/ — Архитектура и модель данных

| Документ | Назначение |
|----------|------------|
| [architecture.md](architecture/architecture.md) | Высокоуровневая схема системы |
| [architecture-guardrails.md](architecture/architecture-guardrails.md) | Архитектурные ограничения и запреты |
| [SYSTEM_BOUNDARIES.md](architecture/SYSTEM_BOUNDARIES.md) | Границы ответственности компонентов |
| [data-model.md](architecture/data-model.md) | Модель данных Medusa |
| [api.md](architecture/api.md) | REST API контракты |
| [admin-flows.md](architecture/admin-flows.md) | Потоки работы в Medusa Admin |

## guidelines/ — Правила разработки

| Документ | Назначение |
|----------|------------|
| [development-rules.md](guidelines/development-rules.md) | Обязательные правила разработки |
| [product-rules.md](guidelines/product-rules.md) | Правила по типам продуктов и checkout |
| [production-dataset-inclusion-rules.md](guidelines/production-dataset-inclusion-rules.md) | Правила включения в production dataset |

## storefront/ — Витрина (Next.js)

| Документ | Назначение |
|----------|------------|
| [storefront-phase1.md](storefront/storefront-phase1.md) | Архитектура витрины Phase 1 |
| [storefront-design-implementation-rules.md](storefront/storefront-design-implementation-rules.md) | Визуальное и UX направление, токены |
| [storefront-component-principles.md](storefront/storefront-component-principles.md) | Принципы компонентов: Header, Footer, Cards |
| [storefront-page-patterns.md](storefront/storefront-page-patterns.md) | Паттерны страниц: Home, Catalog, Product, Cart |
| [storefront-content-model.md](storefront/storefront-content-model.md) | Контентная модель витрины |
| [storefront-ui-refactor-brief.md](storefront/storefront-ui-refactor-brief.md) | План UI-рефакторинга |
| [naming-system.md](storefront/naming-system.md) | Система наименований для UI |
| [catalog-interpretation-rules.md](storefront/catalog-interpretation-rules.md) | Правила интерпретации каталога и metadata |
| [catalog-target-display-model.md](storefront/catalog-target-display-model.md) | Целевая модель отображения (карточка / PDP / группы) |
| [catalog-implementation-gap-audit.md](storefront/catalog-implementation-gap-audit.md) | Пробелы реализации относительно правил |
| [catalog-interpretation-implementation-report.md](storefront/catalog-interpretation-implementation-report.md) | Отчёт о внедрении правил интерпретации |

## content/ — Источники, маппинг, парсеры

| Документ | Назначение |
|----------|------------|
| [content-mapping.md](content/content-mapping.md) | Маппинг данных: workbook → legacy → Yandex Disk |
| [content-sourcing-rules.md](content/content-sourcing-rules.md) | Правила и приоритеты источников контента |
| [asset-mapping-strategy.md](content/asset-mapping-strategy.md) | Стратегия инвентаризации ассетов (контентный слой) |
| [legacy-scrape-strategy.md](content/legacy-scrape-strategy.md) | Стратегия скрапинга woodright.ru |
| [fuzzy-promotion-rules.md](content/fuzzy-promotion-rules.md) | Правила промоции fuzzy matches |
| [manual-review-queues.md](content/manual-review-queues.md) | Очереди ручного ревью |
| [image-map-notes.md](content/image-map-notes.md) | Схема image-map |
| [workbook-parser-notes.md](content/workbook-parser-notes.md) | Документация parse-workbook.py |
| [front-folder-review-strategy.md](content/front-folder-review-strategy.md) | Стратегия ревью front-папок |
| [entity-mapping-readiness-report.md](content/entity-mapping-readiness-report.md) | Готовность entity mapping |

## assets/ — Стратегии и планы по файлам ассетов

| Документ | Назначение |
|----------|------------|
| [asset-storage-strategy.md](assets/asset-storage-strategy.md) | Размещение processed assets, URL, CDN |
| [asset-preprocess-execution-strategy.md](assets/asset-preprocess-execution-strategy.md) | Выполнение препроцесса ассетов |
| [disk-asset-preprocess-strategy.md](assets/disk-asset-preprocess-strategy.md) | Препроцесс ассетов с диска |
| [product-asset-binding-strategy.md](assets/product-asset-binding-strategy.md) | Привязка ассетов к товарам |
| [pdf-extraction-strategy.md](assets/pdf-extraction-strategy.md) | Извлечение изображений из PDF |
| [entity-mapping-strategy.md](assets/entity-mapping-strategy.md) | Маппинг сущностей контента (ассеты / URL) |
| [preferred-asset-download-plan.md](assets/preferred-asset-download-plan.md) | План загрузки приоритетных ассетов |
| [asset-coverage-expansion-plan.md](assets/asset-coverage-expansion-plan.md) | Расширение покрытия ассетами |
| [final-asset-review-plan.md](assets/final-asset-review-plan.md) | План финального ревью ассетов |
| [asset-url-mapping-notes.md](assets/asset-url-mapping-notes.md) | Заметки по маппингу URL ассетов |

## collections/ — Документация по коллекциям

- [collections/README.md](collections/README.md) — навигация по коллекциям.
- **Greenwich** — все планы, аудиты и отчёты: каталог [collections/greenwich/](collections/greenwich/) (ingestion, seed, refresh, display, preprocess, кровати и т.д.).
- **Oliver**, **Willie Winkie** — зарезервировано: [collections/oliver/README.md](collections/oliver/README.md), [collections/willie-winkie/README.md](collections/willie-winkie/README.md).

## ingestion/ — Навигация по ingestion / seed

См. [ingestion/README.md](ingestion/README.md) (куда смотреть за документами по прогону данных).

## reports/ — Аудиты и отчёты (общие и по ассетам)

### Общие аудиты

| Документ | Назначение |
|----------|------------|
| [legacy-site-audit.md](reports/legacy-site-audit.md) | Аудит woodright.ru как content donor |
| [yandex-disk-audit.md](reports/yandex-disk-audit.md) | Аудит Yandex Disk |
| [price-workbook-audit.md](reports/price-workbook-audit.md) | Анализ структуры прайс-файла |
| [legacy-image-matching-report.md](reports/legacy-image-matching-report.md) | Результаты matching изображений |
| [fuzzy-match-review.md](reports/fuzzy-match-review.md) | Детальный разбор fuzzy matches |
| [fuzzy-review-report.md](reports/fuzzy-review-report.md) | Итоговый отчёт по promotion |
| [front-folder-review-report.md](reports/front-folder-review-report.md) | Отчёт по ревью front-папок |

### reports/assets/

| Документ | Назначение |
|----------|------------|
| [asset-binding-readiness-note.md](reports/assets/asset-binding-readiness-note.md) | Готовность привязки ассетов |
| [asset-coverage-expansion-report.md](reports/assets/asset-coverage-expansion-report.md) | Расширение покрытия ассетами |
| [asset-preprocess-report.md](reports/assets/asset-preprocess-report.md) | Отчёт по препроцессу ассетов |
| [asset-upload-readiness-report.md](reports/assets/asset-upload-readiness-report.md) | Готовность к загрузке ассетов |
| [disk-download-execution-report.md](reports/assets/disk-download-execution-report.md) | Выполнение загрузки с диска |
| [disk-download-readiness-report.md](reports/assets/disk-download-readiness-report.md) | Готовность загрузки с диска |
| [pdf-fallback-report.md](reports/assets/pdf-fallback-report.md) | Fallback по PDF-изображениям |
| [product-asset-binding-report.md](reports/assets/product-asset-binding-report.md) | Привязка ассетов к товарам |
| [production-subset-readiness-report.md](reports/assets/production-subset-readiness-report.md) | Готовность production subset |

Отчёты по **Greenwich** перенесены в [collections/greenwich/](collections/greenwich/) (рядом со стратегиями коллекции).

## Стабильные якоря для AI и процессов

- `docs/guidelines/development-rules.md`
- `docs/architecture/architecture-guardrails.md`
- `docs/project/CODEMAP.md`
