# Onboarding и материализация ассетов (после Layer A)

Цель: после `git clone` восстановить **рабочее окружение** (картинки на диске у backend + при необходимости сырьё пайплайна), не полагаясь на хранение бинарников в git.

**Архитектура:** один Medusa backend ([`architecture-guardrails.md`](../architecture/architecture-guardrails.md)), storefront — тонкий клиент. Бизнес-логика и seed выполняются в backend; скрипты в `scripts/` — воспроизводимые шаги пайплайна.

**Связанные документы:** [`repo-weight-audit.md`](repo-weight-audit.md), [`repo-cleanup-plan.md`](repo-cleanup-plan.md).

---

## 1. Что остаётся в git

- **Код:** `apps/backend/src/`, `apps/storefront/`
- **Документация:** `docs/`
- **Скрипты пайплайна:** `scripts/`
- **Конфиги:** Docker, `package.json`, workspace-файлы и т.п.
- **Контрактный слой данных (normalized JSON):** `data/normalized/*.json` — входы для `seed-real-data.ts`, Greenwich seed, маппинг и манифести upload (см. §5).
- **Манифесты обработки (без бинарников):** `data/processed/asset-manifests/*.json` **кроме** `local-upload-*.json` (эти три файла — лог конкретного прогона, в `.gitignore`).

Пустые якоря каталогов: `apps/backend/static/products/.gitkeep`, `apps/backend/uploads/products/.gitkeep`, `data/processed/storefront-assets/.gitkeep`.

---

## 2. Что больше не хранится в git (обычные tracked-файлы)

| Путь | Роль |
|------|------|
| `data/raw/**` | Сырьё: PDF, PNG страниц, скрейп legacy, скачанные с сайта изображения, парс workbook |
| `data/processed/storefront-assets/**` | Выход препроцессинга (картинки под витрину/Greenwich) |
| `apps/backend/static/products/**` | Материализация каталога для Express static (`/static/...`) |
| `apps/backend/uploads/products/**` | Копия/деплой под путь uploads (Greenwich deploy, исторически дублировала `static/products`) |
| `local-upload-*.json` | Статус/ошибки/summary последнего локального upload |

История коммитов **до** Layer A по-прежнему содержит старые blob; новые коммиты не добавляют эти пути обратно в индекс.

---

## 3. Канонические runtime-пути (без рефакторинга кода)

- **Real-data / Oliver–Provence–CLP (идемпотентный upload):** скрипт `scripts/upload-assets-to-local-storage.py` материализует файлы в **`apps/backend/static/`** (см. `BACKEND_MATERIALIZATION_ROOT` в скрипте). Публичный URL по умолчанию в скрипте — **`http://localhost:9000/static`** (переменная `ASSET_BASE_URL`).
- **Greenwich:** `scripts/deploy-greenwich-assets.py` копирует из `data/processed/storefront-assets/greenwich` в **`apps/backend/uploads/products/greenwich`**. Для согласованности с Medusa в конкретном окружении смотрите, какой префикс реально отдаётся (`/static` vs `/uploads`) — см. [`post-seed-asset-checks.md`](post-seed-asset-checks.md).

Два дерева **намеренно** остаются разными по сценарию: один скрипт пишет в `static`, другой — в `uploads`. В git оба дерева `products/**` пустые до материализации; дублирование «двух полных копий всего каталога» в git убрано.

---

## 4. Как получить raw после clone (при необходимости полного пайплайна)

`data/raw` не в индексе. Варианты:

1. **Скопировать** архив raw с машины, где пайплайн уже собирался (tar/rsync/S3 — по политике команды).
2. **Повторить ingestion:** скрипты в `scripts/` (парс workbook, скрейп, PDF и т.д.) — см. `docs/ingestion/` и имена скриптов в репозитории; требуются исходные PDF/доступ к источникам.

Без raw **полная** пересборка `processed` с нуля невозможна; для **только seed + уже готовые normalized URL** достаточно материализовать финальные файлы по манифесту upload (если есть источник байтов — см. §6).

---

## 5. Обязательный контракт normalized (seed / import / assets)

**Минимум для `seed-real-data.ts`:**

- `data/normalized/seed-collections.json`
- `data/normalized/seed-categories.json`
- Один из продуктовых файлов (порядок в коде): `seed-products.fixed2.json` → `seed-products.fixed.json` → `seed-products.json`
- `data/normalized/seed-assets.json`

**Рекомендуется в git для целостности пайплайна:**

- `entity-mapping.json`, `entity-mapping-excluded.json`, `entity-mapping-summary.json` (и схемы рядом)
- `product-asset-binding.json` (+ summary / schema)
- `asset-upload-execution-manifest.json` (имя актуализировать по скрипту upload)

**Greenwich:**

- `data/normalized/greenwich-ingestion.json` — читается `seed-greenwich.ts` / `refresh-greenwich.ts`

Промежуточные ревью-файлы (`image-map*`, `review-queue*`, `unresolved*`, …) остаются в git как лёгкий аудит; при сомнении **не удалять** без отдельного решения (консервативная политика Layer A).

---

## 6. Как материализовать ассеты локально (типичный порядок)

Пути и флаги уточняйте в `--help` у конкретного скрипта.

1. **Зависимости:** Python 3, зависимости backend/storefront по README проекта.
2. **Processed storefront images** (если есть `data/raw` и нужны выходы): например `preprocess-downloaded-assets.py`, `preprocess-greenwich-assets.py` и др. — в `data/processed/storefront-assets/`.
3. **Greenwich → uploads:**  
   `python3 scripts/deploy-greenwich-assets.py`  
   (ожидает `data/processed/storefront-assets/greenwich`).
4. **Каталог Oliver/Provence/CLP → static:**  
   `python3 scripts/upload-assets-to-local-storage.py`  
   (пишет под `apps/backend/static/`, опционально `--write-manifest` / `--write-seed-inputs`).

После материализации файлы появляются локально; git их не отслеживает (кроме `.gitkeep`).

---

## 7. Seed

- Канонический демо-сид: `apps/backend/src/scripts/seed.ts`
- Draft real-data: `apps/backend/src/scripts/seed-real-data.ts` с `REAL_DATA_SEED_CONFIRM=1` (из корня backend или через `medusa exec` — как принято в проекте)

Перед seed убедитесь, что **файлы по путям из URL** существуют на диске у процесса Medusa (Docker volume или локальный `apps/backend`).

---

## 8. Производные vs source-of-truth (кратко)

| Слой | Тип |
|------|-----|
| `data/normalized/*.json` (контракт выше) | SoT для приложения и сидов в текущем процессе |
| `data/processed/asset-manifests/*.json` (кроме local-upload) | Зафиксированные манифесты шагов |
| `data/raw`, `data/processed/storefront-assets`, `static/products`, `uploads/products` | Производные / runtime; восстанавливаются скриптами и внешними архивами |

---

## 9. Если что-то сломалось после clone

- Пустой каталог `products` — ожидаемо до шага §6.
- 404 по картинкам при существующих файлах — см. согласование URL `/static` vs `/uploads` с конфигом Medusa ([`post-seed-asset-checks.md`](post-seed-asset-checks.md)).
- Для уменьшения размера **исторического** clone см. Layer C в [`repo-cleanup-plan.md`](repo-cleanup-plan.md) (только по согласованию команды).
