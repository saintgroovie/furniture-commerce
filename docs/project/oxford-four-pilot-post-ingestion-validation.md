# Oxford-4 controlled pilot — post-ingestion validation

**Scope:** pilot only — **not** Oxford rollout, **not** storefront enablement. Oxford остаётся **`PAUSED`** в `catalog-scope.ts`. Greenwich / Oliver **не изменяются** этим проходом.

---

## Среда агента / CI без локального backend (blocked)

Post-ingestion DB validation и guarded sync **нельзя** «доделать» из среды без рабочего backend: здесь **не** создаётся канонический отчёт, **не** подставляется `verdict` вручную и **не** закрывается evidence.

**Типичные признаки, что запускать validate/sync бессмысленно или запрещено:**

- в PATH нет **`yarn`**;
- **`apps/backend/node_modules`** пуст или отсутствует **`node_modules/.bin/medusa`**;
- не задан **`DATABASE_URL`** (и нет доступа к той же живой БД, что при pilot seed);
- **`data/normalized/oxford-four-pilot-post-ingestion-validation.json`** отсутствует — его появление только из успешного локального `medusa exec`, не из правки вручную.

**Инварианты:** не писать fake JSON с `"verdict": "ok"`, не запускать `yarn oxford-pilot-four:sync-ingested-evidence` до реального `ok`, не править **`oxford-four-pilot-ingested-evidence.json`** без committed validation report (guardrails в скрипте sync и в [ingested-evidence doc](./oxford-four-pilot-ingested-evidence.md)).

Закрытие **`post_ingestion_db_evidence`** — только на машине оператора с установленными зависимостями, Medusa и БД; далее — разделы **«Команда»**, **«Интерпретация verdict»** и **«Закрытие governance»** ниже.

---

## Когда запускать

После успешного:

1. `yarn oxford-pilot-four:materialize-static`
2. `yarn oxford-pilot-four:smoke` (verdict `ok`)
3. `OXFORD_PILOT_CONFIRM=1 yarn oxford-pilot-four:seed`

из каталога **`apps/backend/`**, против **той же** БД и backend URL, что использовались при сиде.

---

## Команда

```bash
cd apps/backend
OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion
```

Без переменной скрипт **не** выполняет проверки БД (no-op), пишет в отчёт `verdict: "skipped"` — см. [`validate-oxford-pilot-four-post-ingestion.ts`](../../apps/backend/src/scripts/validate-oxford-pilot-four-post-ingestion.ts).

**Артефакт:** [`data/normalized/oxford-four-pilot-post-ingestion-validation.json`](../../data/normalized/oxford-four-pilot-post-ingestion-validation.json).

---

## Что проверяется (read-only)

| Проверка | Смысл |
|----------|--------|
| **Storefront pause contract** | Файл `apps/storefront/src/lib/catalog-scope.ts` **не редактируется**; читается с диска: `oxford` ∈ `PAUSED_COLLECTION_KEYS`, не в `ACTIVE_COLLECTION_KEYS`. |
| **Ровно 4 продукта** | Handles `ox-14-1`, `ox-14-11`, `ox-90-1`, `s-ox-05` присутствуют в Medusa. |
| **Metadata пилота** | `collection: "oxford"`, `oxford_pilot_four: true`, `workbook_row_key`, `readiness_status: seed_ready_with_caveat`, `entity_layer_readiness_status: pdf_seed_interim`. |
| **Медиа** | `thumbnail` и `images[]` не пустые; thumbnail указывает на `static/products/oxford`; число картинок ≥ числу в `seed-products.oxford-pilot-four.json`. |
| **Вариант / цена** | SKU и `amount` / `currency_code` совпадают с пилотным JSON. |
| **ProductClassification** | `product_type === CONFIGURABLE` через `query.graph`. |

---

## Опционально: Greenwich / Oliver (только чтение)

Пилотный сид **не** должен удалять чужие товары. Явной проверки «ничего не изменилось» без снимка БД нет; доступен **опциональный** spot check существования:

```bash
OXFORD_PILOT_POST_INGESTION_VALIDATE=1 \
OXFORD_PILOT_VALIDATE_REFERENCE_HANDLES=gw-your-handle,ol-00-1 \
yarn oxford-pilot-four:validate-post-ingestion
```

Подставьте **реальные** Medusa `handle` из вашего окружения (по одному из Greenwich и Oliver достаточно). Скрипт только проверяет, что записи с этими handle ещё есть в БД.

---

## Интерпретация verdict

| `verdict` | Действие |
|-----------|----------|
| `ok` | Пилотные 4 SKU в БД согласованы с JSON и контрактом паузы витрины. |
| `fail` | `violations[]` в JSON + stderr от `medusa exec` (exit ≠ 0). |
| `skipped` | Не задан `OXFORD_PILOT_POST_INGESTION_VALIDATE=1` — отчёт в `data/normalized/` **по умолчанию не пишется** (чтобы не закоммитить псевдо-evidence). Для отладки: `OXFORD_PILOT_VALIDATION_WRITE_SKIPPED_REPORT=1`. |

---

## Закрытие governance (`post_ingestion_db_evidence`)

После **`verdict": "ok"`**:

1. Закоммитьте `data/normalized/oxford-four-pilot-post-ingestion-validation.json`.
2. Из `apps/backend`: **`yarn oxford-pilot-four:sync-ingested-evidence`** — обновляет [`oxford-four-pilot-ingested-evidence.json`](../../data/normalized/oxford-four-pilot-ingested-evidence.json) (без Medusa). Sync **не** выполнится при отсутствии файла, `verdict !== "ok"`, `verdict === "skipped"` или `skipped: true`.
3. Закоммитьте обновлённый evidence JSON. Полный чеклист шагов 1–7: [`oxford-four-pilot-ingested-evidence.md`](./oxford-four-pilot-ingested-evidence.md).

---

## Связанные документы

- [`oxford-four-pilot-ingestion-dry-run.md`](./oxford-four-pilot-ingestion-dry-run.md) — dry-run + §9 pilot path.
- [`oxford-four-pilot-ingested-evidence.md`](./oxford-four-pilot-ingested-evidence.md) — governance bundle + что закоммитить после успешного validate.
- [`CODEMAP.md`](./CODEMAP.md) — карта скриптов backend.
