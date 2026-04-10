# Repo weight audit — binary & generated artifacts

**Ветка:** `storefront/phase1-foundation-and-polish`  
**Опорный коммит:** `f22b53e` (и HEAD на момент аудита)  
**Дата аудита:** 2026-04-10  

**Ограничения аудита:** только анализ и классификация; без изменений истории, без удаления файлов, без push.

---

## 1. Executive summary

Репозиторий раздулся из‑за одного коммита с **полным набором пайплайн-артефактов**: сырые PDF/PNG, выгрузки с сайта, обработанные изображения, **дубликат** финальных ассетов в `apps/backend/static` и `apps/backend/uploads` (деревья `products/` **идентичны**), плюс копии в `data/processed/storefront-assets/` и частично в `data/raw/downloaded-assets/`. В **Git объекты занимают ~639 MiB** (`git count-objects`), рабочая копия **~1.4 GiB**.

**Архитектурно** это не нарушает guardrails (один backend, тонкий storefront), но **нарушает здравый смысл хранения кода**: бинарники и runtime-копии смешаны с исходниками. Долгосрочно **не OK**; краткосрочно **можно работать**, если команда осознаёт размер clone и не делает лишних веток от тяжёлого base без необходимости.

**Ключевой вывод:** воспроизводимость seed/asset flow опирается на **нормализованные JSON + скрипты + (опционально) закреплённые манифесты**, а не на хранение **всех** копий картинок в трёх местах и **полного** `data/raw` в git.

---

## 2. Метрики (факты)

### 2.1. Верхний уровень

| Объект | Размер (рабочее дерево) |
|--------|-------------------------|
| `.git` (объекты) | ~640 MiB |
| Весь репозиторий | ~1.4 GiB |
| `data/` | ~705 MiB |
| `data/raw` | ~652 MiB |
| `data/processed` | ~48 MiB |
| `data/normalized` | ~4.1 MiB |
| `apps/backend/uploads` | ~47 MiB |
| `apps/backend/static` | ~47 MiB |
| `apps/backend/data` | ~488 KiB |
| `docs` | ~916 KiB |
| `scripts` | ~336 KiB |

### 2.2. `data/raw` по подкаталогам

| Путь | ~размер |
|------|---------|
| `data/raw/pdf-assets` | ~425 MiB |
| `data/raw/downloaded-assets` | ~200 MiB |
| `data/raw/legacy` | ~26 MiB |
| `data/raw/front` | ~724 KiB |
| `data/raw/workbook` | ~592 KiB |
| `data/raw/assets` | ~44 KiB |

Файлов в `data/raw`: **~1130** (включая сотни PNG/PDF).

### 2.3. Отслеживаемые файлы (HEAD)

- **Всего путей в git:** ~3354  
- **Расширения (топ):** `.jpg` ~2493, `.png` ~395, `.json` ~102, `.md` ~111, `.html` ~91, `.pdf` ~9, и т.д.

### 2.4. Дублирование `static` vs `uploads`

Сравнение `apps/backend/static/products` и `apps/backend/uploads/products`: **0 отличий** (`diff -rq`). То есть в репозитории закоммичены **две полные копии** одного и того же дерева продуктовых изображений (плюс логически та же материя в `data/processed/storefront-assets/` для части коллекций). Git **дедуплицирует идентичные blob** по содержимому, но в рабочем дереве и в головах разработчиков это остаётся лишним; при разных файлах размер объекта бы рос линейно.

### 2.5. Крупнейшие отслеживаемые файлы (по `git ls-tree -l`, хвост)

Практически все **самые большие** объекты — **PNG страниц/вырезок из PDF** и **исходные PDF** под `data/raw/pdf-assets/`, плюс отдельные **скачанные Greenwich PNG** в `data/raw/downloaded-assets/`. Максимальный одиночный blob в выборке: **`Greenwich.pdf` ~6.9 MiB**; типичные PNG **~3–5.5 MiB**. Отдельные изображения **ниже лимита GitHub 100 MiB**, но **суммарный** объём clone большой.

---

## 3. Findings по зонам

### 3.1. `data/normalized/` (~4.1 MiB, ~49 файлов)

Почти всё — **JSON**. Это основной **контрактный слой** для скриптов и `seed-real-data.ts` / Greenwich seed.

| Подмножество | Роль |
|--------------|------|
| `seed-collections.json`, `seed-categories.json`, `seed-products*.json`, `seed-assets.json`, `seed-summary*.json` | **Входы draft real-data seed** (приоритет: `fixed2` → `fixed` → базовый файл). |
| `entity-mapping.json`, `entity-mapping-excluded.json`, `entity-mapping-summary.json`, схемы | **Маппинг и границы** пайплайна; для воспроизводимости обычно **нужны** в git (или явный экспорт из внешнего SoT). |
| `product-asset-binding*.json`, `asset-upload-execution-manifest.json`, `asset-upload-manifest*.json` | **Связь продукт → ассет** и манифесты заливки; для QA и идемпотентного upload — **ценны** в git. |
| `image-map*.json`, `review-queue*.json`, `unresolved*.json`, `*-review.json` | **Промежуточные/ревью** артефакты; текстовые, относительно лёгкие; полезны для аудита, но **не** обязаны быть вечным SoT. |
| `greenwich-*.json` (кроме путей, реально читаемых скриптами) | Часть — **ревью/очереди**; `greenwich-ingestion.json` — **читается** `seed-greenwich.ts` / `refresh-greenwich.ts` → **оставить** под контролем версий. |

**Вывод:** зона **должна** оставаться в git в сокращённом «контрактном» виде; отдельные чисто диагностические JSON можно позже вынести или генерировать по запросу.

### 3.2. `data/processed/asset-manifests/` (~1.4 MiB)

JSON: манифесты скачивания, препроцессинга, Greenwich, disk, legacy fallback, **`local-upload-*.json`**.

- Манифесты **генерации** пайплайна: полезны для **воспроизводимости** «какие файлы ожидались».
- `local-upload-status.json`, `local-upload-failures.json`, `local-upload-summary.json` — **артефакты конкретного прогона** на машине разработчика; ценны для review, но **пересоздаются** скриптом upload.

### 3.3. `data/processed/storefront-assets/` (~47 MiB)

Обработанные **изображения** (в т.ч. Greenwich). Это **производные** от raw + скриптов. Совпадения по содержимому с путями под `apps/backend/static|uploads` подтверждены для отдельных файлов (одинаковый blob).

### 3.4. `apps/backend/static/` и `apps/backend/uploads/` (~47 MiB каждый)

**Runtime-материализация** для Medusa/Express. Скрипт `upload-assets-to-local-storage.py` ориентируется на **`apps/backend/static`** как корень публикации (см. комментарии в скрипте); отдельный `deploy-greenwich-assets.py` пишет в **`uploads`**. В git сейчас **две одинаковые копии** `products/` — это **не** должно быть долгосрочной нормой: одна роль «источник в git» (если вообще хранить бинарники) + одна цель деплоя, либо **ни одной** в git (только восстановление из пайплайна).

### 3.5. `data/raw/` (~652 MiB)

| Подзона | Содержимое | Характер |
|---------|------------|----------|
| `pdf-assets` | Исходные PDF, рендер страниц в PNG, extracted crops | **Тяжёлый сырьевой ввод** экстракции |
| `downloaded-assets` | Скачанные с продакшена/сайта изображения | **Сырьё**, может частично дублировать processed |
| `legacy` | HTML и сопутствующее (скрейп) | **Сырьё** для маппинга |
| `workbook` | Сейчас в основном **parsed JSON** (~592 KiB), не бинарный xlsx в дереве | Промежуточный парс |
| `front`, `assets` | Относительно мелкие входы | Сырьё |

**Вывод:** для **полной** воспроизводимости «с нуля» raw желателен **где-то** (git / LFS / артефактный bucket), но **не обязан** быть в том же репозитории, что и приложение.

### 3.6. Прочее

- **`apps/backend/data/`** — небольшой объём; уточнить назначение при следующем ревью (не смешивать с `data/` в корне без документации).
- **Build/cache:** `node_modules`, `.yarn`, `.medusa` уже в `.gitignore`; новых крупных кэшей в tracked не видно.

---

## 4. Классификация (сводка)

| Группа | Примеры | Рекомендация по хранению в git как обычные файлы |
|--------|---------|--------------------------------------------------|
| Source of truth: код и доки | `apps/backend/src`, `apps/storefront`, `docs`, `scripts` | **Оставить** |
| Конфиги и контракты | `package.json`, Docker, схемы JSON, нормализованные seed-входы | **Оставить** |
| Generated / run logs | `local-upload-*.json` (прогон), часть summary после каждого run | **Спорно:** удобно для QA; можно не коммитить, а генерировать в CI/локально |
| Raw datasets | `data/raw/pdf-assets`, `downloaded-assets`, `legacy` | **Убрать из обычного git** (ignore / внешнее хранилище / LFS) — по политике команды |
| Normalized «промежуточки» | review queues, image-map passes | **Оставить** кратко или архивировать; мало весят |
| Runtime duplicates | `static/products` **и** `uploads/products` | **Хотя бы одну** копию убрать из отслеживания; идеально — **обе**, восстанавливать скриптом |
| Processed images | `data/processed/storefront-assets` | **Не дублировать** с backend static; либо одно место в git+LFS, либо вне git |

---

## 5. Кандидаты для `.gitignore` (паттерны)

Ниже — **кандидаты для обсуждения**, не применённые изменения.

```gitignore
# Raw pipeline inputs (prefer artifact store or fetch script)
/data/raw/pdf-assets/
/data/raw/downloaded-assets/
/data/raw/legacy/

# Optional: entire raw tree if workbook source lives elsewhere
# /data/raw/

# Materialized product images (regenerate: upload-assets / deploy scripts)
/apps/backend/uploads/products/
/apps/backend/static/products/

# Processed binaries (optional if single source of truth elsewhere)
/data/processed/storefront-assets/

# Local upload run artifacts (regenerate)
/data/processed/asset-manifests/local-upload-status.json
/data/processed/asset-manifests/local-upload-failures.json
/data/processed/asset-manifests/local-upload-summary.json
```

Точные паттерны нужно согласовать с **одним** выбранным способом восстановления окружения (см. `repo-cleanup-plan.md`).

---

## 6. Кандидаты для Git LFS

Имеет смысл, если команда **хочет** версионировать бинарники, но не раздувать pack обычными blob:

| Тип | Паттерн | Замечание |
|-----|---------|-----------|
| PDF каталогов | `data/raw/pdf-assets/source-pdfs/*.pdf` | Редко меняются; удобно на LFS |
| Крупные PNG | `data/raw/pdf-assets/**/*.png` | Много файлов — LFS увеличивает сложность clone |
| Финальные jpg каталога | `apps/backend/static/products/**/*.jpg` **или** один архив | Альтернатива — **вообще не** в git |

LFS **не** освобождает историю автоматически: уже записанные blob останутся в истории до rewrite (Layer C).

---

## 7. Внешнее хранилище (кандидаты)

- Весь **`data/raw`** как **версионируемый архив** (S3/GCS + manifest checksum в репо).  
- **Секретные** или лицензионно чувствительные материалы (если появятся) — только внешне.  
- CI-артефакты прогонов upload (JSON + логи).

---

## 8. Связь с архитектурой

- **Backend = SoT по логике** — не страдает от выноса бинарников из git, если **docker-compose / README** описывают шаг «подтянуть ассеты».  
- **Storefront = thin client** — не зависит от того, где лежат картинки, пока URL согласованы с Medusa.  
- **Seed flow** зависит от **`data/normalized/*.json`** и от **наличия файлов** на диске у backend; путь к файлам задаётся скриптами, не архитектурой monorepo.

---

## 9. Вердикт

| Вопрос | Ответ |
|--------|--------|
| **OK ли временно работать как сейчас?** | **Да**, функционально; неудобно по размеру clone и дублям. |
| **OK ли как долгосрочное состояние?** | **Нет**: смешение сырья, processed и двойной runtime-копии без политики. |

Детальный план действий: [`repo-cleanup-plan.md`](repo-cleanup-plan.md). После Layer A — onboarding и материализация: [`repo-onboarding-and-assets-runbook.md`](repo-onboarding-and-assets-runbook.md).
