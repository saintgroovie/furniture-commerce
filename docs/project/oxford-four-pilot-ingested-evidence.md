# Oxford-4 pilot-ingested evidence pass

**Тип шага:** governance / documentation / evidence — **не** rollout Oxford и **не** включение витрины.

**Где выполнять закрытие `post_ingestion_db_evidence`:** только на машине с установленным backend (`yarn install` в `apps/backend`), запущенной БД и прогнанным пилотным сидом. В песочнице без Medusa/БД эти шаги **не** заменяют реальный `verdict: ok`. Явный статус «агент / toolchain / DB blocked»: раздел **«Среда агента / CI без локального backend (blocked)»** в [`oxford-four-pilot-post-ingestion-validation.md`](./oxford-four-pilot-post-ingestion-validation.md).

**Смысл для UX/бизнеса:** Oxford **не** выкатывается в публичный каталог. Этот проход фиксирует техническое доказательство, что **ровно четыре** пилотных SKU прошли изолированный pilot ingestion и по-прежнему **скрыты** от storefront (коллекция `oxford` в паузе).

---

## Machine-readable отчёт

- [`data/normalized/oxford-four-pilot-ingested-evidence.json`](../../data/normalized/oxford-four-pilot-ingested-evidence.json) — сводка претензий, указатели на артефакты, снимок pre-ingestion smoke, статус post-ingestion JSON.

---

## Что уже зафиксировано в репозитории

| Утверждение | Доказательство |
|-------------|----------------|
| Pilot-only ingestion path реализован | Скрипты в `apps/backend/scripts/*.mjs`, `seed-oxford-pilot-four.ts`, команды `yarn oxford-pilot-four:*` в `apps/backend/package.json`. |
| Post-ingestion validation доступен | `validate-oxford-pilot-four-post-ingestion.ts` + `oxford-pilot-four:validate-post-ingestion`. |
| Pre-ingestion smoke `ok` | Закоммичен [`oxford-four-pilot-ingestion-smoke.json`](../../data/normalized/oxford-four-pilot-ingestion-smoke.json). |
| Oxford остаётся **PAUSED** на витрине | `oxford` ∈ `PAUSED_COLLECTION_KEYS` в `apps/storefront/src/lib/catalog-scope.ts`; пилотные задачи витрину не меняли. |
| Full `seed-real-data` / merge в `fixed2` не были частью пилота | Пилот читает только `seed-products.oxford-pilot-four.json`; см. evidence JSON `claims`. |
| Greenwich / Oliver не были целью пилотовых скриптов | Запись в evidence JSON + опциональный read-only spot check в validate через `OXFORD_PILOT_VALIDATE_REFERENCE_HANDLES`. |

---

## Закрытие `post_ingestion_db_evidence` (operator flow, из `apps/backend`)

Инварианты tooling (не нарушать):

- `validate-oxford-pilot-four-post-ingestion.ts` **не** пишет canonical JSON при skip; `skipped`-отчёт только при `OXFORD_PILOT_VALIDATION_WRITE_SKIPPED_REPORT=1`.
- `oxford-pilot-four-sync-ingested-evidence.mjs` **отказывается** от sync, если файла нет, нет поля `verdict`, `verdict !== "ok"`, `verdict === "skipped"` или `skipped === true`.
- Evidence **нельзя** переводить в `post_ingestion_db_evidence: ok` вручную без реального validation report с БД.

| Шаг | Действие |
|-----|----------|
| 1 | Post-ingestion validation против живой Medusa DB (read-only): `OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion` |
| 2 | Убедиться, что создан **`data/normalized/oxford-four-pilot-post-ingestion-validation.json`**. |
| 3 | Проверить **`"verdict": "ok"`** (не `skipped`, не `fail`). |
| 4 | Закоммитить validation report. |
| 5 | Guarded sync (Medusa не нужен): `yarn oxford-pilot-four:sync-ingested-evidence` |
| 6 | Проверить diff: **`oxford-four-pilot-ingested-evidence.json`** обновлён из validation (в т.ч. `claims.post_ingestion_validation_result_committed`, `verdict.post_ingestion_db_evidence: ok`). |
| 7 | Закоммитить обновлённый evidence JSON (опционально: в [`collection-status-matrix.md`](./collection-status-matrix.md) строка Pilot ingested evidence → **OK**). |

Пока шаги 1–4 не выполнены, в evidence остаётся **`post_ingestion_validation_result_committed.value: false`** и **`verdict.post_ingestion_db_evidence: pending_committed_validation_json`**.

---

## Канонический порядок локального прогона

```bash
cd apps/backend
yarn oxford-pilot-four:materialize-static
yarn oxford-pilot-four:smoke
OXFORD_PILOT_CONFIRM=1 yarn oxford-pilot-four:seed
OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion
```

---

## Связанные документы

- [`oxford-four-pilot-ingestion-dry-run.md`](./oxford-four-pilot-ingestion-dry-run.md)
- [`oxford-four-pilot-post-ingestion-validation.md`](./oxford-four-pilot-post-ingestion-validation.md)
- [`collection-status-matrix.md`](./collection-status-matrix.md) (секция Oxford)
- [`CODEMAP.md`](./CODEMAP.md)
