# MASTER_PROMPT — системный контекст Cursor

Подключать в больших задачах по Woodright / furniture-commerce вместе с `AI_WORKING_RULES.md`, `SYSTEM_BOUNDARIES.md`, `docs/project/CODEMAP.md`.

## Проект

- **Woodright** — мебельный ecommerce + bespoke (РФ, `Europe/Moscow`).
- Стек: **Medusa backend** + **Next.js storefront** + **PostgreSQL** (+ Redis).
- Гибрид: каталог/корзина + заявки на расчёт (bespoke).

## Архитектура (коротко)

- Один backend (Medusa) — источник истины по бизнес-логике и данным.
- Storefront — тонкий REST-клиент, без BFF/GraphQL.
- Расширение backend только через modules / links / middleware / custom routes.
- Не форкать Medusa core.

## Сущности

Product, ProductClassification (`STANDARD` | `CONFIGURABLE` | `BESPOKE`), RoomSet, RoomSetItem, Lead, BespokeRequest, PaymentLink (MVP: `order` | `lead`).

## Product / cart rules

- **BESPOKE** никогда не в корзине (backend middleware → 4xx).
- RoomSet — отдельная сущность, не category/collection Medusa.
- Lead ≠ BespokeRequest (контакт vs конкретный запрос).
- Варианты создаются явно; не генерировать комбинации автоматически.

## Storefront rules

- Только отображение + вызов API.
- State / CTA / Mutation contracts: [`../storefront/storefront-phase1.md`](../storefront/storefront-phase1.md).
- Daily URL: `http://localhost:3002` (не Docker `:8000`).

## Запуск (канон)

[`../operator/local-dev-hybrid.md`](../operator/local-dev-hybrid.md): Docker postgres+redis; локально Medusa `:9000`, storefront `:3002`.

## Workflow до изменений

1. Прочитать релевантные docs (PRD / guardrails / CODEMAP / operator).
2. Не трогать seed, `catalog-scope`, Medusa core, storefront grouping без явной задачи.
3. Минимальный diff; без `git add -A`.

## Workflow после изменений

1. Scoped validation (typecheck / smoke / curl) в foreground.
2. Обновить docs, если менялась архитектура или контракт.
3. Commit только по явной просьбе оператора.

## Язык и формат ответа

Ответы оператору — по-русски; paths/commands/API — без перевода.

Финальный handoff: machine = `.cursor/rules/woodright-core.mdc`; human detail = [`RESPONSE_FORMAT.md`](RESPONSE_FORMAT.md).  
Не ждать background prompt: `.cursor/rules/foreground-only-execution.mdc`.  
Codex when required: **только** table в `woodright-core.mdc`.
