# Launch A scoped ingest gate — ready scope summary

**Generated:** 2026-06-15  
**Verdict:** `needs_review`  
**Repo:** `/Users/leonidmbp/Documents/projects/furniture-commerce`  
**Branch:** `qa/willie-winkie-flow-a-matrix-board` · **HEAD:** `9a0574e`

## Что это значит

Draft Launch A на 28 handles прошёл структурную валидацию: operator-approved, CONFIGURABLE, draft, request_quote, справочные цены есть, tier-цены не выдуманы. В Postgres **0/28** handles уже есть — дубликатов нет, импорт = create-only (idempotent skip).

Gate **не блокирует** ingest из-за tier prices TODO. Блокеров уровня «нет safe path» нет — есть проверенный Oxford-4 pattern.

**Почему `needs_review`, а не `ready_for_scoped_ingest`:**

1. **Kids routing** — в draft JSON нет явных полей Kids / Детская / Woodright Kids; правило зафиксировано только в business spec. Storefront `resolveKidsProducts()` сейчас не подхватит `willie-winkie` автоматически на `/kids/catalog`.
2. **mo-02-1** — `collection: molly`; slug `molly` **не** в `ACTIVE_COLLECTION_KEYS` (`catalog-scope.ts`) → без решения оператора товар может не попасть в `/catalog`.
3. **Import script** ещё не создан — только plan + seed-shaped JSON в tmp.

## Draft validation

| Check | Result |
|-------|--------|
| Products | 28 |
| Unique handles | 28 |
| CO-02-1 / AM-02-1 | absent |
| CONFIGURABLE | 28/28 |
| draft | 28/28 |
| request_quote | 28/28 |
| reference_price_rub | 28/28 |
| tier prices fake | 0 |
| material tier labels | 28/28 |

## DB snapshot (read-only)

| Metric | Value |
|--------|-------|
| Total products | **143** |
| Pilot handles in DB | **0/28** |
| Duplicate risk | **create_only** (idempotent skip if re-run) |
| Oxford in DB | 4 published (`ox-14-1`, `ox-14-11`, `ox-90-1`, `s-ox-05`) |
| willie-winkie collection | **missing** (must create) |
| molly collection | **missing** |
| Categories present | komody, shkafy, stellazhi |
| Category missing | **stoly-i-stoliki** (7 products need it) |

## Kids classification

| Rule | Status |
|------|--------|
| Business: WW = Kids / Детская / Woodright Kids | Spec only |
| Explicit in draft JSON | **no** |
| Implicit via collection | 27× `willie-winkie`, 1× `molly` (mo-02-1) |
| Import metadata template | `storefront_section=kids`, `room_type=детская`, `cart_group=Woodright Kids` |

## Dirty worktree (not cleaned)

| Class | Examples |
|-------|----------|
| **launch-relevant (committed)** | QA matrix board on branch |
| **tmp-only** | `tmp/willie-winkie-flow-a-*`, `tmp/launch-a-ingest-gate/` |
| **unrelated dirty** | `apps/backend/src/api/**`, `apps/storefront/package.json`, screenshots |
| **dangerous to continue** | Untracked `data/normalized/**` — **do not stage/commit** without gate |

## Next gated action

1. Operator: решить `mo-02-1` → `willie-winkie` + `painting_name=Molly` **или** отдельная collection `molly` + catalog-scope update.
2. Engineering: создать `seed-willie-winkie-flow-a-pilot-28.ts` (Oxford pattern) + dry-run.
3. Operator: `pg_dump` backup → dry-run → confirm apply.

See `flow-a-ingest-command.md` for exact commands.
