# AI_WORKING_RULES

Операционные правила для Cursor/AI. Подключать в больших задачах. Детали архитектуры — в `SYSTEM_BOUNDARIES.md` и `architecture/architecture-guardrails.md`.

**Как отвечать оператору:** machine = `.cursor/rules/woodright-core.mdc` + foreground; human detail = [`RESPONSE_FORMAT.md`](RESPONSE_FORMAT.md).  
**Codex when:** единая table в `woodright-core.mdc` (не дублировать).  
**Foreground-only:** `.cursor/rules/foreground-only-execution.mdc`.

## 10 инвариантов

1. Не переносить бизнес-логику во frontend.
2. Backend — источник истины (типы товаров, корзина, заявки).
3. Не дублировать cart state на клиенте (без global store / optimistic updates в Phase 1).
4. Не вводить BFF, GraphQL, микросервисы, лишние приложения.
5. Не подменять RoomSet category/collection/product.
6. Не обходить Medusa core без необходимости; не форкать core.
7. При смене архитектуры/контракта — сначала обновить docs.
8. Предпочитать простые расширения (module / link / middleware / route).
9. Перед изменениями сверяться с docs (PRD, guardrails, CODEMAP).
10. Секреты, seed, production/legacy write — только по явной задаче оператора.

## Pre-change checklist

- [ ] Какой docs-файл — источник истины для этой задачи?
- [ ] Затрагивается ли граница из `SYSTEM_BOUNDARIES.md`?
- [ ] Нужен ли update docs до/после кода?
- [ ] Минимальный ли scope (без unrelated dirty tree)?
- [ ] Dev server / watch — только с явным approval; иначе build/typecheck/curl.
- [ ] Финальный ответ: user schema / FORMAT A / B / C по `woodright-core.mdc` + `RESPONSE_FORMAT.md`?
- [ ] Codex по **core decision table** обязателен? (не по устаревшим спискам в routing)

## Red flags (остановиться)

- «Добавим BFF / отдельный gateway»
- «Проверим тип товара только на фронте»
- «Положим BESPOKE в корзину для удобства»
- «Поправим Medusa core»
- `git add -A`, коммит `.env`, коммит сырых media/DB dumps
- Автозапуск `yarn dev` / `medusa develop` без просьбы оператора
- «Готово / verified» без foreground evidence или после background prompt без re-run
- Success-style report сразу после Codex `request-changes` без remediation

## Связанные документы

- [`README.md`](README.md) — оглавление AI
- [`RESPONSE_FORMAT.md`](RESPONSE_FORMAT.md)
- [`MASTER_PROMPT.md`](MASTER_PROMPT.md)
- [`SYSTEM_BOUNDARIES.md`](SYSTEM_BOUNDARIES.md)
- [`../project/CODEMAP.md`](../project/CODEMAP.md)
- [`../guidelines/development-rules.md`](../guidelines/development-rules.md)
- [`../operator/local-dev-hybrid.md`](../operator/local-dev-hybrid.md)
