# Карта кода проекта

## Назначение проекта

- **Woodright** — мебельный ecommerce + bespoke.
- Стек: **Medusa backend**, **Next.js storefront**, **PostgreSQL**.
- Гибрид: каталог, покупка через корзину и заявки на расчёт (bespoke).

---

## Верхнеуровневая структура репозитория

- **docs/** — документация проекта (источник истины для архитектуры и правил).
- **apps/backend/** — Medusa backend (REST API, бизнес-логика, БД).
- **apps/storefront/** — Next.js storefront (тонкий клиент к backend).

---

## docs/

**Каталоги верхнего уровня:** `guidelines/`, `architecture/`, `project/`, `storefront/` (включая `catalog-*.md`), `content/`, `assets/`, `collections/` (например `collections/greenwich/`, `collections/oliver/`, `collections/oxford/`), `ingestion/` (README-навигация), `reports/`, `content-pipeline/` (только редирект README). В корне `docs/` — **только** `README.md`; тематические `.md` не кладём в корень. Подробное оглавление: [`docs/README.md`](../README.md).

Назначение основных файлов (логические имена; физические пути — с префиксом раздела, см. README):

| Файл | Назначение |
|------|------------|
| **MASTER_PRD.md** | Главный PRD: видение, типы товаров, каталог, Room Sets, checkout, bespoke, MVP. |
| **architecture.md** | Высокоуровневая архитектура: Medusa, Next.js, PostgreSQL, потоки данных. |
| **data-model.md** | Модель данных: Product (расширение), RoomSet, Lead, BespokeRequest, PaymentLink, связи. |
| **api.md** | REST API: каталог, корзина, Room Sets, заявки, Payment Link. |
| **mvp-scope.md** | Границы MVP: что в scope и вне scope. |
| **phases.md** | Этапы разработки (Phase 0–6) и Definition of Done. |
| **product-rules.md** | Правила типов товаров (STANDARD / CONFIGURABLE / BESPOKE), корзина, Room Set. |
| **admin-flows.md** | Поведение админки: Room Sets, Leads, Bespoke Requests, Payment Links. |
| **storefront-phase1.md** | Архитектура storefront Phase 1: страницы, API, компоненты, CTA, DoD. |
| **storefront-design-implementation-rules.md** | Design system: visual direction, color palette, typography, spacing, anti-patterns. |
| **storefront-page-patterns.md** | Page-level patterns: homepage, catalog, PDP, cart, room sets, bespoke. |
| **storefront-component-principles.md** | Component-level principles: header, cards, buttons, forms, gallery, badges. |
| **storefront-ui-refactor-brief.md** | Phased UI refactor plan (A-E). Phases A-D completed, Phase E next. |
| **development-rules.md** | Обязательные правила разработки (документация, модули, не менять core). |
| **architecture-guardrails.md** | Архитектурные ограничения (без BFF, без микросервисов, storefront без бизнес-логики). |
| **PROJECT_STATUS.md** | Текущее состояние: backend Phase 1, storefront, ограничения MVP, следующий шаг. |
| **MASTER_PROMPT.md** | Системный промпт для Cursor: контекст, сущности, product/cart/storefront rules, workflow до и после изменений. |
| **AI_WORKING_RULES.md** | Правила работы AI: 10 инвариантов, pre-change checklist, red flags. Подключать в больших задачах. |
| **SYSTEM_BOUNDARIES.md** | Неизменяемые границы системы: архитектура, домен, логика, cart, product, API, расширение, сложность, docs, эскалация. |
| **CODEMAP.md** | Карта кода для AI: структура, модули, сущности, правила, точки осторожности. |
| **collection-rollout-pipeline.md** | Rollout OS по коллекциям: readiness ladder, gate flow, forbidden shortcuts, текущие governance-политики (Oxford/Monchelsea/WW/Oliver Kids). |
| **collection-status-matrix.md** | Живая decision-матрица по приоритетным коллекциям: stage, blocker, next allowed action, evidence required, forbidden actions, rollout verdict. |
| **collection-rollout-decision-framework.md** | Canonical pre-change checklist/template for collection rollout PR/task: blocker taxonomy, stage gates, evidence contract, forbidden stage jumps. |
| **collection-asset-intake-pipeline.md** | Reusable multi-collection asset intake/evidence/promotion lane: source hierarchy, asset stages, classification rules, handoff to media validation/photo readiness. |
| **collection-asset-intake-refresh-runbook.md** | Short governance runbook for pre-pass refresh cycle: source checks, read-only summary build, interpretation rules, allowed vs forbidden changes. |
| **templates/collection-rollout-pre-change-checklist.md** | Reusable copy/paste template for collection rollout PR/Cursor-task: stage, blocker, source-of-truth, evidence, forbidden shortcuts, verdict. |
| **monchelsea-rollout-pre-change-checklist.md** | Filled governance-only pre-change checklist pass for Monchelsea (Stage 0/1 boundary, blocker plan, no seed/ingestion/storefront mutation). |
| **monchelsea-source-asset-blocker-resolution.md** (`docs/content/`) | Monchelsea source+asset blocker buckets A–D: workbook vs manifest vs manual asset verdicts, sign-offs, Disk / white-background follow-ups, forbidden actions. |
| **`data/normalized/monchelsea-source-asset-blocker-resolution.json`** | Machine-readable governance artifact: `rollout_verdict: governance_only`, per-bucket entries, `next_required_operator_actions` (no product/seed/storefront mutations). |
| **monchelsea-disk-expansion-plan.md** (`docs/content/`) | Operator-focused planning pass for 28 `disk_manifest_gap_candidate` rows: white-background search workflow, explicit forbidden actions, no rollout mutation. |
| **`data/normalized/monchelsea-disk-expansion-plan.json`** | Planning artifact from bucket C (`no_disk_asset_by_join_key`): per-row Yandex Disk search plan and evidence update actions under governance-only constraints. |
| **monchelsea-manual-identity-closure-backlog.md** (`docs/content/`) | Governance/manual review backlog for Monchelsea `manual_identity_review_needed` rows: per-row confidence, manual next action, and no auto-promotion guardrails. |
| **`data/normalized/monchelsea-manual-identity-closure-backlog.json`** | Machine-readable manual identity closure queue for Monchelsea (26 rows) with grouping (`confirmed/probable/ambiguous/no_match/blocked`) and residual blocker context. |
| **monchelsea-human-reviewer-signoff-worksheet.md** (`docs/content/`) | Human-only row-by-row worksheet for Monchelsea manual identity sign-off with blank reviewer fields and governance guardrails. |
| **`data/normalized/monchelsea-human-reviewer-signoff-template.json`** | Machine-readable template for Monchelsea human reviewer sign-off (`confirmed/probable/no_match/blocked_by_source_or_workbook_issue/keep_pending`) with empty reviewer fields. |
| **monchelsea-human-reviewer-visual-packet.md** (`docs/content/`) | Human reviewer visual packet for 26 Monchelsea manual-identity rows: per-row evidence references, visual status, and blank reviewer fields. |
| **`data/normalized/monchelsea-human-reviewer-visual-packet.json`** | Machine-readable visual reviewer packet for Monchelsea with row-level `visual_status` (`visual_evidence_ready/visual_evidence_missing/source_path_unresolved/needs_yandex_disk_mount`) and unresolved path diagnostics. |
| **monchelsea-yandex-source-availability-check.md** (`docs/content/`) | Governance-only availability check for Monchelsea white-background Yandex source mount: expected paths, mount diagnostics, and rebuild readiness verdict. |
| **`data/normalized/monchelsea-yandex-source-availability-check.json`** | Machine-readable source availability diagnostics for Monchelsea: strict Yandex mount status, candidate-file counts, and rows with potential visual candidates. |
| **`data/normalized/collection-asset-intake-summary.json`** | Machine-readable multi-collection asset intake snapshot: source availability, usable vs blocked estimates, blocker taxonomy, next allowed asset steps and guardrails. |
| **collection-asset-intake-summary.md** (`docs/content/`) | Human-readable multi-collection intake summary: reusable lane purpose, coverage vs blockers, allowed next asset/photo steps, blocked paths. |
| **product-card-photo-coverage-policy.md** (`docs/storefront/`) | Controlled best-available photo coverage policy for product cards: source priority, suitability tiers, approval gates, and forbidden auto-use rules. |
| **visual-asset-source-priority-policy.md** (`docs/project/`) | Reusable controlled visual source-priority policy for card photos: white-background first, interim fallback classes, ambiguity/missing/AI follow-up taxonomy. |
| **`data/normalized/storefront-best-available-photo-candidates.json`** | Machine-readable best-available photo candidate manifest: prioritized sources, per-product candidate suitability/confidence, blocked/not-allowed rows, and governance summary. |
| **`data/normalized/visual-asset-candidate-manifest.json`** | Collection-aware controlled visual assignment candidate manifest: primary/gallery candidates, source-type/confidence, warnings, and `can_use_for_card_now` vs follow-up flags. |
| **`data/normalized/oxford-visual-source-inventory.json`** | Oxford-only read-only visual source inventory: local static + PDF extract + legacy front-manifest refs, Yandex mount verdict, per-file confidence (no white-background claims without evidence). |
| **`data/normalized/oxford-visual-candidate-map.json`** | Oxford workbook SKU → visual candidate mapping: pilot-four confirmed interim paths; remaining SKUs missing until Yandex/Disk or new evidence; `can_use_for_interim_card_now` / materialize flags vs media readiness. |
| **oxford-visual-source-analysis.md** (`docs/project/`) | Human-readable Oxford visual source analysis: roots checked, inventory summary, Oxford-4 pilot block, PARTIAL verdict when Yandex not mounted. |
| **oxford-visual-review-packet.md** (`docs/project/`) | Reviewer packet: confirmed / probable / ambiguous / missing / AI follow-up groupings for Oxford visuals (governance-only). |
| **product-card-photo-approval-review.md** (`docs/storefront/`) | Human approval review packet for best-available card-photo candidates: recommendation groups, pending visual review rows, policy rejects, and safe next action. |
| **`data/normalized/storefront-best-available-photo-approval-review.json`** | Machine-readable approval review output for best-available candidates: reviewed rows, recommendation/approval status, blocked set, and implementation guardrails. |
| **`data/normalized/storefront-mvp-best-available-media-map.json`** | Controlled MVP media fill map: per-product selected primary source, temporary fallback rationale, blocked set, and deferred AI follow-up backlog. |
| **mvp-best-available-media-fill.md** (`docs/storefront/`) | Human-readable MVP media fill brief: source priority, temporary photo eligibility rules, collection-aware triage outcome, blocked rows, and next actions. |
| **mvp-media-fill-implementation-plan.md** (`docs/storefront/`) | Non-executed implementation plan for future controlled media apply: backend SoT path, dry-run/no-op behavior, paused-collection guards, and rollback expectations. |
| **`data/normalized/storefront-mvp-media-assignment-dry-run.json`** | Controlled MVP media assignment dry-run: eligibility rules, proposed assignments vs skipped rows, verdicts (apply vs paused-scope), and script reference notes (no DB apply). |
| **mvp-media-assignment-dry-run.md** (`docs/storefront/`) | Human-readable dry-run report: verdict, tables, Oxford/Monchelsea/WW/Oliver notes, no-runtime confirmation, and next apply gate. |
| **`apps/backend/src/scripts/apply-mvp-media-assignments.ts`** | Controlled MVP media assignment executor: reads media dry-run JSON, writes `storefront-mvp-media-assignment-executor-dry-run.json`; dry-run supports **white_background_v1** + **temporary_non_white_static_local** (`eligible_temporary_local_visual_ready`); `--apply` needs `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1`, and temporary static rows also **`MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1`**. |
| **`data/normalized/storefront-mvp-media-assignment-executor-dry-run.json`** | Executor evidence: eligible vs skipped rows, pre-apply source checks, apply guardrails; with `--apply`, includes `apply_attempts` / `apply_summary`. |
| **`data/normalized/storefront-mvp-media-pre-apply-gate.json`** | Pre-apply verification artifact (no DB): CO-02-1 Class B checks, on-disk source, `apply_gates`, mirrored blocked rows vs executor dry-run. |
| **mvp-media-assignment-executor.md** (`docs/storefront/`) | Executor brief: dry-run vs apply, env confirm, FILE upload for local paths, Oxford paused note, CO-02-1 first candidate note. |
| **mvp-media-pre-apply-gate.md** (`docs/storefront/`) | Human-readable pre-apply gate for CO-02-1: checks, temporary-only rationale, env gates, skipped list, rollback note, explicit no-apply. |
| **`data/normalized/storefront-mvp-media-source-contract.json`** | Source availability contract for MVP media safe candidate(s): canonical source refs, mount/file existence checks, executor post-check, and verdict (`source_mount_required` or ready). |
| **mvp-media-source-contract.md** (`docs/storefront/`) | Human-readable source contract pass for MVP media: checked roots, CO-02-1 path verdict, required mount/sync before any governed apply. |
| **`data/normalized/storefront-mvp-media-source-unblock-operator-pack.json`** | Operator unblock packet for CO-02-1: allowed mount vs static paths, forbidden actions, verification checklist, expected dry-run outcome (no apply). |
| **mvp-media-source-unblock-operator-pack.md** (`docs/storefront/`) | Short human runbook to unblock CO-02-1 source when auto-resolution is still_blocked: exact filename/paths, Variant A/B, verification, dry-run only + future apply gate text. |
| **`data/normalized/visual-source-inventory-index.json`** | Read-only visual source inventory: Yandex roots status, scanned local image files (static + raw/processed caches), legacy front-manifest rows, normalized manifest paths, `summary.by_source_system`. |
| **`data/normalized/visual-source-product-candidate-map.json`** | MVP-anchored candidate map + `blocked_or_ambiguous[]` from inventory heuristics; links to inventory ids; no runtime mutation. |
| **visual-source-inventory-and-matching-report.md** (`docs/storefront/`) | Human summary: root availability, counts, white-bg vs fallback, CO-02-1 note, MVP map touch scope, explicit no-apply. |
| **mvp-media-selection-refresh-report.md** (`docs/storefront/`) | Post-inventory MVP media selection refresh: MVP map + assignment dry-run deltas, CO-02-1 before/after, executor v1 whitelist caveat, no-apply confirmation. |
| **`scripts/build-visual-source-inventory.mjs`** | Read-only regen script for `visual-source-inventory-index.json` + `visual-source-product-candidate-map.json` (no asset copy; re-run after mount/materialize). |
| **product-card-photo-ux-audit.md** (`docs/storefront/`) | Scoped storefront UX audit + controlled visual triage baseline: UI findings, source-gap boundary, Oxford-4 interim mini-summary, and non-readiness guardrails. |
| **`data/normalized/storefront-product-card-photo-ux-backlog.json`** | Machine-readable UX backlog + `visual_assignment_triage`: collection-aware counters, Oxford-4 interim classification, and follow-up routing (`asset_pipeline` / `ai_visual` / reviewer sign-off). |
| **collection-asset-intake-refresh-runbook.md** (`docs/project/`) | Operational refresh guide for regular governance passes before matrix/status interpretation. |
| **templates/monchelsea-disk-expansion-operator-findings-template.md** | Reusable operator submission template for 28 Monchelsea disk-gap rows: standardized result status, confidence, path/file evidence, reviewer gate, forbidden-action check. |
| **monchelsea-disk-expansion-auto-findings.md** (`docs/content/`) | Automated read-only harvest report for 28 Monchelsea disk-gap rows: source availability, machine-generated match basis/confidence, and next review actions. |
| **`data/normalized/monchelsea-disk-expansion-auto-findings.json`** | Machine-generated findings artifact from local white-background source scan (no manifest mutation, no stage promotion). |
| **collections/oliver/oliver-final-technical-media-readiness.md** | Закрытие Oliver technical/media readiness на reference stack: коммиты, статус OK, толкование (manual QA отдельно, другие окружения, Greenwich), без новой методологии проверки. |
| **MEDUSA_DOCKER_GUIDE.md** | Medusa v2 в Docker: Yarn 4, volume/node_modules, env (два URL для storefront), CORS, Admin/Vite, чеклист запуска, частые ошибки. |

---

## apps/backend/

- Это **Medusa backend** (один инстанс). Единственный источник истины для бизнес-логики и данных.

**Структура и ответственность:**

- **src/modules/** — кастомные модули: product-extension (ProductClassification), room-set, lead, bespoke-request, payment-link. Модели, сервисы, индекс каждого модуля.
- **src/api/store/** — store API: products, product/[id], room-sets, room-sets/[slug], leads, bespoke-requests.
- **src/api/admin/** — admin API: room-sets, room-sets/[id], leads, leads/[id], bespoke-requests, bespoke-requests/[id], payment-links, payment-links/[id].
- **src/api/middlewares.ts** — middleware: защита корзины (BESPOKE не допускается в line-items).
- **src/links/** — связи между сущностями: Product ↔ ProductClassification, Product ↔ RoomSetItem.
- **src/scripts/seed.ts** — сид: регион РФ, категории, продукты с типами, Room Sets с товарами.
- **Oxford-4 pilot (изолированно от `seed-real-data.ts`):** `apps/backend/scripts/oxford-pilot-four-materialize-static.mjs` (materialize c support for `data/normalized/oxford-four-pilot-interim-asset-source-map.json`: preferred interim-static source, fallback to PDF extract), `scripts/oxford-pilot-four-smoke.mjs` (subset + static + seed JSON), `src/scripts/seed-oxford-pilot-four.ts` (`OXFORD_PILOT_CONFIRM=1`), `src/scripts/validate-oxford-pilot-four-post-ingestion.ts` (`OXFORD_PILOT_POST_INGESTION_VALIDATE=1`, read-only после сида). Команды: `yarn oxford-pilot-four:*` в `apps/backend`. См. `docs/project/oxford-four-pilot-ingestion-dry-run.md`, `docs/project/oxford-four-pilot-interim-asset-source-map.md`, `docs/project/oxford-four-pilot-post-ingestion-validation.md`, `data/normalized/oxford-four-pilot-interim-asset-source-map.json`, `data/normalized/oxford-four-pilot-ingested-evidence.json` + `docs/project/oxford-four-pilot-ingested-evidence.md`. После коммита `oxford-four-pilot-post-ingestion-validation.json` с `verdict: ok`: `yarn oxford-pilot-four:sync-ingested-evidence` (обновляет evidence JSON).

Backend не форкается; расширение только через модули, links и middleware.

---

## apps/storefront/

- Это **тонкий клиент** к backend REST API. Без BFF, без GraphQL. Не содержит бизнес-логики корзины и типов товаров.

**Структура и ответственность:**

- **src/app/** — маршруты Next.js App Router: layout, главная, catalog, product/[id], rooms, rooms/[slug], bespoke (лендинг, catalog), bespoke/request (форма заявки), cart, checkout.
- **Oxford local QA preview (не rollout):** `src/app/qa/oxford-pilot-four/page.tsx` + `src/lib/qa/oxford-pilot-four.ts` — локальная визуальная проверка только 4 pilot handles (`ox-14-11`, `ox-90-1`, `ox-14-1`, `s-ox-05`) с режимами `medusa` / `seed_json_fallback` / `missing`; fallback читает `data/normalized/seed-products.oxford-pilot-four.json` только для QA route, без изменения `catalog-scope.ts` и публичного `/catalog`.
- **src/components/** — UI-компоненты: product-card, product-cta, room-set-card, room-set-cta, bespoke-form, cart-summary, checkout-form.
- **src/lib/api/** — вызовы backend: products, room-sets, leads, bespoke-requests, cart, checkout, base (URL).
- **src/lib/format.ts** — shared presentation utilities: `formatRub` (price formatting), `getPrice` (variant price extraction).
- **src/lib/cart/session.ts** — сессия корзины: чтение/запись cart_id в cookie, ensureCart (создание корзины через backend при отсутствии).

Storefront только отображает данные и вызывает API; правила (например, кто идёт в корзину) определяет backend.

---

## Ключевые бизнес-сущности

- **Product** — товар Medusa; тип задаётся связью с ProductClassification.
- **ProductClassification** — тип товара: STANDARD | CONFIGURABLE | BESPOKE (связь 1:1 с Product). Таблица `product_classification`, поле `product_type`.
- **RoomSet** — готовая комната (отдельная сущность): title, slug, описание, price_from, room_type, style, is_active.
- **RoomSetItem** — позиция в Room Set: связь с Product, quantity, sort_order.
- **Lead** — контакт/источник заявки (source, name, email, phone, comment); один Lead — много BespokeRequest.
- **BespokeRequest** — заявка на расчёт: lead_id, опционально product_id/room_set_id, dimensions, materials, budget, comment, status.
- **PaymentLink** — ссылка на оплату: entity_type (order | lead), entity_id, amount, url, status; в MVP только order и lead.

---

## Ключевые правила

- **BESPOKE** никогда не добавляется в корзину; проверка на backend (middleware), при нарушении — 4xx.
- **RoomSet** — отдельная сущность, не category и не collection Medusa.
- **Lead** и **BespokeRequest** разделены: Lead — контакт, BespokeRequest — конкретный запрос на расчёт.
- **PaymentLink** в MVP только для entity_type **lead** и **order** (не draft_order).
- **Backend** — источник истины по бизнес-логике; при расхождении править код, а не документацию без согласования.
- **Storefront** не дублирует backend-правила (типы товаров, валидация корзины); только отображение и вызов API.

---

## Точки осторожности

- Не форкать и не править **Medusa core**; расширять только модулями, links, middleware.
- Не добавлять **BFF** и дополнительные backend-приложения.
- Не выносить бизнес-логику (правила типов товаров, корзины, заявок) во **frontend**.
- Не генерировать **комбинации вариантов** автоматически; варианты создаются явно.
- Не усложнять **cart state** в Phase 1 (без глобального store, без optimistic updates).
- Не менять архитектуру без **сначала обновления docs** (architecture, data-model, api и т.д.).

---

# Как использовать CODEMAP

- **Перед изменениями** читать CODEMAP.md, чтобы понимать структуру и ответственность модулей.
- Сверяться с **development-rules.md** (правила разработки, модули, core).
- Сверяться с **architecture-guardrails.md** (ограничения архитектуры).
- Сверяться с **MASTER_PRD.md** при добавлении функций и сценариев.
- Если изменение затрагивает архитектуру или контракты — **сначала обновлять docs**, затем код.
