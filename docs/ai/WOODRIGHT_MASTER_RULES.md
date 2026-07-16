# WOODRIGHT — MASTER RULES, GUARDRAILS AND WORKFLOW

**Версия:** 2026-07-11
**Аудитория:** ChatGPT (писатель промптов / советчик) + оператор (UX/UI) + Cursor-агенты
**Код репозитория:** `/Users/leonidmbp/Documents/projects/furniture-commerce`
**Machine short rule:** `.cursor/rules/woodright-core.mdc`
**Формат ответов Cursor:** `.cursor/rules/woodright-response-format.mdc` → `docs/ai/RESPONSE_FORMAT.md`

---

## 0. Как пользоваться этим документом

### 0.0. Rule precedence (порядок приоритета)

**Normative machine copy:** `.cursor/rules/woodright-core.mdc` (не дублировать иной порядок в других rules).

При конфликте применять **сверху вниз**:

1. **Explicit current user instruction**, включая **запрошенную схему ответа** (секции/JSON/table).
2. **Security / data / git hard guardrails** — секреты, seed/apply/DB, `git add -A`, force push, clean dirty tree.
3. **Accepted architecture / product invariants** — thin storefront, BESPOKE/cart, RoomSet, утверждённая навигация.
4. **Task-specific rules** — Media Ops, kids separation, GitHub PR flow и т.п.
5. **Default workflow / FORMAT policy** — audit-first, FORMAT A/B/C, hybrid ports.
6. **Human docs & current implementation state**.

Explicit user schema **переопределяет** FORMAT A/B/C, но **не отменяет** честное раскрытие: Task status, validation, changed files, commit/push/PR, blockers, Codex when required.

**Код не отменяет продукт:** implementation divergence ≠ новый канон.

### 0.1. Слои правил (не смешивать)

| Слой | Что внутри | Меняется ли часто |
|------|------------|-------------------|
| **A. Жёсткие инварианты** | Архитектура, домен, git/data safety, BESPOKE/cart, RoomSet | Только явным UX/arch решениемнием + update docs |
| **B. Default policy** | Workflow агентов, validation gate, model routing, prompts | Редко; улучшать без смены продукта |
| **C. Task-specific** | Media Ops stages, Flow A / WW / Molly, Codex commit gate | По типу задачи |
| **D. Current UX directives** | Nav order, catalog/PDP UI, цвета kids, powerlines, RU тире ` - ` (без `—`) | По UX-решению; сверять с кодом |
| **E. Temporary runtime** | branch, HEAD, PID, dirty tree, ports up/down | **Не хранить здесь** — только в session packet |

### 0.2. Роли ИИ (default, не абсолютный запрет)

| Роль | Где | Default ответственность |
|------|-----|-------------------------|
| **ChatGPT** | внешний чат | **architect / prompt writer / analyst**: требования, UX review, remediation planning, разбор артефактов, copy-ready промпты |
| **Cursor Agent** | Cursor | **local executor**: audit → implement в репо → validate → FORMAT A packet |
| **Codex CLI** | CLI / MCP | **independent reviewer**; не основной implementer |

Default: правки файлов репозитория делает Cursor Agent.
ChatGPT **не запрещён** для анализа, планирования remediation, UX review и работы с отчётами/артефактами.
Прямой edit репо через ChatGPT — не default workflow (нет локального worktree), если оператор не выбрал иной канал явно.

### 0.3. Dual-root (canonical vs mirror)

| Root | Path | Роль |
|------|------|------|
| **Canonical** | `/Users/leonidmbp/Documents/projects/furniture-commerce` | единственный источник истины для кода и `.cursor/rules` |
| **Thin mirror** | `/Users/leonidmbp/furniture-commerce` | только зеркало Cursor workspace; **не** второй source of truth |

Правила:

- редактировать `.cursor/rules` **только** в canonical root;
- mirror синхронизировать **отдельной проверяемой** операцией (не «на глаз»);
- сравнивать hashes файлов rules;
- при расхождении **побеждает canonical root**.

В этой governance-доке не требуется sync script; структура файлов не меняется ради dual-root.

### 0.4. Обязательные docs перед крупной задачей

- `docs/guidelines/development-rules.md`
- `docs/architecture/architecture-guardrails.md`
- `docs/project/CODEMAP.md`
- при ответах/отчётах: `docs/ai/RESPONSE_FORMAT.md`
- запуск: `docs/operator/local-dev-hybrid.md` (ports `:3002` / `:9000`)

В промптах явно: «следуй project rules; проверь architecture guardrails; используй CODEMAP».

---

# A. ЖЁСТКИЕ ИНВАРИАНТЫ

## A1. Пользователь и язык

- Владелец — **UX/UI-дизайнер**, не программист.
- Объяснения — по-русски, без теории ради теории.
- Промпты для проекта — **по-русски**.
- Paths / commands / API / env / commits — без перевода.

## A2. Архитектура

- Monorepo `furniture-commerce`: `apps/storefront` (Next.js App Router) + `apps/backend` (Medusa v2).
- **Backend = source of truth** (товары, варианты, цены, классификация, корзина).
- Storefront = **thin client**; без бизнес-логики ценообразования/классификации в React.
- Запрет без отдельного arch-решения: BFF, GraphQL, микросервисы, fork Medusa core, rewrite internals, дублирующие frontend API-слои, DB schema ради UI-фикса, тяжёлые deps ради мелкого UI.
- **RoomSet** — отдельная сущность; не collection/product Medusa.
- Workbook / утверждённые коммерческие данные — canonical commercial source.

## A3. Продуктовая модель

| Класс | Покупательский смысл | Cart |
|-------|----------------------|------|
| `STANDARD` | Готовые | да |
| `CONFIGURABLE` | С выбором исполнения | да, после выбора варианта |
| `BESPOKE` | По проекту / `request_quote` | **никогда**; middleware → ошибка, не silent add |

Frontend **не придумывает** доступные конфигурации.
Не превращать BESPOKE в обычный товар ради UI.

Kids:

- отдельный раздел/навигация; не путать с purchase logic;
- kids separation: `apps/storefront/src/lib/kids.ts` (room sets), **не** ProductClassification;
- одна shared cart/checkout; visual grouping только.

## A4. Данные / media / secrets

Без явного approval запрещено: seed, ingest, product-media apply, DB writes, publish, commit, push, auto-apply, legacy login, live prod DB.

Default для assignment packs: `do_not_auto_apply: true`.
Не печатать secrets в git / md / tmp / logs / prompts / screenshots.
`CO-02-1` не использовать в auto-assignment без отдельного решения (цель review: `CO-02-1 = 0`).

## A5. Git safety

Без явного approval запрещено: `git add -A` / `git add .`, commit, push, force push, amend, reset, stash всего дерева, clean, checkout чужих файлов, «почистить» dirty primary clone.

Всегда заново проверить branch / HEAD / staged / unstaged / untracked.
Stage только нужные hunks, если файл был dirty до задачи.

## A6. Процессы

- Foreground-only: не ждать Cursor background prompt; не автостарт `yarn dev` / `medusa develop` / watch.
- Не `killall node` / `pkill node`; только конкретный PID при необходимости.
- Hybrid канон: Docker postgres+redis; локально Medusa `:9000`, storefront `:3002` (не primary Docker `:8000`).

---

# B. DEFAULT POLICY

## B1. Workflow агента

Средняя/большая задача:

1. rules + CODEMAP
2. fresh git status
3. найти компоненты / data flow
4. read-only audit
5. файлы-кандидаты + план
6. маленький vertical slice
7. validate
8. FORMAT A packet (Cursor)

Не «исправь весь сайт» одним diff.
Не начинать массовую правку по одному скриншоту без карты компонентов.

### B1.1. Короткий task LOOP (вместо портянок)

Skill: `.cursor/skills/woodright-task-loop/`  
Триггеры: `луп` | `луп до пуша` | `луп: fix` | `луп: verify` | `луп: type=<pack>`  
Domain packs: `pricing` → `material-execution-pricing-loop`; `media` → `media-photo-verify-loops` (см. `types.md`).  
Machine pointer: `.cursor/rules/woodright-core.mdc` (Project skills).

## B2. UX общие принципы (default)

Премиальный мебельный бренд ≠ маркетплейс / админка / SaaS / дешёвый шаблон.

- спокойствие, тёплый минимализм, товар важнее контролов;
- не передизайнивать язык сайта без разрешения;
- не удалять рабочие UX-функции ради «чистоты»;
- copy централизовать в `src/lib/woodright-copy.ts`.

## B3. Validation (default gate)

Маршруты: `/`, `/catalog`, `/kids/catalog`, adult+kids PDP, variants PDP, cart, STANDARD/CONFIGURABLE add, BESPOKE request_quote.
Viewports: 360, 390, 1280, 1440 (+1600 layout-sensitive).
Проверять действие (click/keyboard/URL), не только DOM.
Typecheck/build/lint если уместно; pre-existing errors отделять от новых.
Не создавать lint-конфиг «заодно».

## B4. Отчёт Cursor (канон)

Исполнитель в Cursor → **FORMAT A** (`docs/ai/RESPONSE_FORMAT.md`):
одна подводка + один fenced `# Woodright report packet`.
Packet целиком в **одном** one-click Copy окне: внешний fence предпочтительно `~~~~markdown` … `~~~~` (внутри допустимы обычные ` ``` `); детали — `woodright-response-format.mdc`.

ChatGPT-советчик → **не** обязан FORMAT A; он отдаёт: модель + copy-ready prompt (+ опционально Codex prompt).

---

# C. DECISION TREES

## C1. Frontend vs backend

```
Нужно менять правило цены / типа / корзины / доступности варианта?
  ├─ да → backend (module/middleware/API); storefront только отображает
  └─ нет → только UI/layout/copy в storefront

Filter/search требует новый API contract?
  ├─ да → STOP, описать нужный backend change оператору
  └─ нет → frontend query params + существующий API
```

## C2. Read-only vs apply (media)

```
Этап?
  census/audit/triage/candidate/assignment/review → READ-ONLY по умолчанию
  apply/publish → только после явного approval + gates
do_not_auto_apply: true пока оператор не сказал иначе
```

## C3. Dirty worktree

```
Есть dirty / untracked вне scope?
  ├─ да → работать pathspec/hunks; НЕ clean/stash/reset
  └─ нет → всё равно не git add -A; только явные paths
```

## C4. Commit

```
Оператор явно просил commit?
  ├─ нет → не commit; в packet: Commit: не создавался
  └─ да → checklist §D2 → staged diff review → commit
```

## C5. Push

```
Оператор явно просил push?
  ├─ нет → GitHub push: not done; ready only after user approval
  └─ да → checklist §D3 → проверить ahead commits scope → push
```

## C6. UI validation

```
Менялся UI?
  ├─ server :3002 up? → smoke routes + viewports + interaction
  └─ server down? → typecheck/build fallback; НЕ автостарт; packet: server not running + exact command
```

## C7. Codex CLI — когда обязателен

**Canonical machine table:** `.cursor/rules/woodright-core.mdc` (Codex decision table).
Human mirror below; on conflict **core wins**.

```
Codex CLI обязателен, если выполняется ЛЮБОЕ из:
  - staged commit gate
  - backend / business logic
  - DB / schema / migrations
  - cart / pricing / ProductClassification
  - Media Ops apply / legacy migration / apply / publish
  - broad refactor; mixed / high-blast-radius diff
  - `.cursor/rules` / AI-governance changes
  - security / credentials-sensitive
  - dirty-file patch staging before commit
  - after closing P1/P2 from prior review

Codex рекомендован: средний storefront impl; shared component; сложный a11y; multi filter flows

Codex НЕ обязателен только если:
  - tiny low-risk БЕЗ commit
  - ИЛИ информационный / mid-task read-only
  - ИЛИ docs typo без commit и без governance/security влияния

Если Codex обязателен, но не запускался → Task status partial|blocked (не commit-ready done)
Иначе → Codex → needs_fixes/request-changes: remediation → re-check → FORMAT A
```

## C8. Model routing

`woodright-model-routing.mdc` is **task-specific**. It must **not** redefine Codex policy (link to core only).

```
Arch / prompts / analysis → GPT-5.5 Thinking (often ChatGPT)
Cursor implement → Fable 5 (Sonnet fallback) + Codex if core table requires
Tiny no-commit → Composer 2.5
Legacy/media/apply → executor + required Codex (core) → FORMAT A
Commit gate / review-only → Codex; fields: Codex commit gate + Codex reviewer status
```

---

# D. CHECKLISTS

## D1. Перед началом задачи

- [ ] Цель одной фразой + «это нужно, чтобы…»
- [ ] Слой правил: invariant / UX directive / media / git?
- [ ] Прочитаны development-rules + guardrails + CODEMAP (если не tiny)?
- [ ] Fresh `git status` / branch / dirty buckets?
- [ ] Server reuse (`curl` `:3002`/`:9000`) или fallback без автостарта?
- [ ] Scope файлов назван; запреты названы?
- [ ] Модель выбрана (§C8)?
- [ ] Codex по §C7 обязателен? (commit gate / backend / DB / cart-pricing-classification / media apply / broad refactor / rules-governance / security / high-blast)

## D2. Перед commit

- [ ] Явный запрос оператора на commit?
- [ ] Только pathspec / hunks своей задачи?
- [ ] `git diff --staged --stat` + name-only просмотрены?
- [ ] Нет `.env`, secrets, raw media dumps, unrelated WIP?
- [ ] Обязательная validation для scope пройдена или явно `blocked`/`partial`?
- [ ] Codex commit-gate (§C7) = `safe_to_commit` (или оператор явно принял риск после `needs_fixes`/`unsafe_scope`)?

## D3. Перед push

- [ ] Явный запрос на push?
- [ ] Какие commits уйдут (`ahead` count + subjects)?
- [ ] Нет чужого неутверждённого scope в ahead?
- [ ] Remote/branch верные?
- [ ] Нет force push на main/master?

---

# E. CURRENT UX DIRECTIVES

> Менять только отдельным UX-решением. Сверять с `layout.tsx` / `globals.css`.

## E0. Тире и UX-копирайт

**Тире:** запрещены `—` / `–`; только ` - ` с пробелами.
Machine: `.cursor/rules/dash-typography.mdc`

**Точки / отбивки / висячие предлоги / collocations:**
- одно предложение в UI - без конечной точки
- две мысли - две строки (`string[]` + `CopyLines`) или `lead` + `supporting`
- точка только между двумя предложениями на одной строке
- короткие предлоги не висят в конце строки (`formatRuInline` / `CopyLines`)
- устойчивые фразы не рвать: `мебель под проект`, `по проекту`, `под ключ` (nbsp + не резать `string[]`)
- союз `и` не начинает следующую строку (`взрослых и детских`, не `взрослых` / `и детских`)
- узкие колонки: явная смысловая отбивка (`string[]`), не только CSS wrap

Machine: `.cursor/rules/ux-copywriting.mdc`
Helper: `apps/storefront/src/lib/format-ru-copy.ts`
Skill (полный свод): `.cursor/skills/ru-ux-ui-copywriting/` (`SKILL.md`, `reference.md`, `checklist.md`)
Buyer SoT: `apps/storefront/src/lib/woodright-copy.ts`
Render: `apps/storefront/src/components/copy-lines.tsx`

## E1. Навигация

**Top (accepted):** Дизайнерам | Контакты

**Main — accepted product navigation (канон):**
`Каталог → Комнаты → Детская → По проекту → О бренде` | Корзина

Bespoke dropdown (accepted): Оставить заявку → Направления → Как это работает.

**Current implementation state** (`apps/storefront/src/app/layout.tsx`, на момент фиксации):
`Каталог → Детская → Комнаты → По проекту → О бренде` — **known divergence** от канона выше.

Правила:

- продуктовый канон = accepted order (`… → Комнаты → Детская → …`);
- код не переписывает канон молча;
- агент не «утверждает» implementation order как product rule;
- выравнивание кода под канон — отдельная UX/implementation задача.


## E2. Цвета (актуально в CSS tokens)

- Adult brand/action: `#3c2f29` / hover `#281f1a`
- Kids action tokens: `#507356` / hover `#446249`
  (в CSS ещё встречаются литералы `#628c6a` — не раздувать drift без задачи на унификацию)

## E3. Композиция и powerlines

Опираться на вертикали header: линия `Шоурум`, линия `Корзина`.
Controls каталога — в том же container, что header.
Сетка товаров — между powerlines. Фильтр согласован с левой линией.
Не прижимать каталог к краю viewport; фильтр не съедает ширину карточек.

## E4. Верх каталога

- Segmented (светлый): `Все` | `Готовые` | `С выбором исполнения`
- `По проекту` — отдельная тёмная округлая кнопка рядом, той же высоты/масштаба (не badge, не случайная обводка); прежняя filter logic
- Search: в общем контейнере; не infinite width; mobile-safe; query params; кнопка `Найти`
- `Найдено N`: внутри search toolbar (предпочтительно в строке поиска левее `Найти`); secondary typography; обновляется после фильтров
- Sort: кастомный dropdown (не native `<select>`): hover/open/selected/focus; outside click; Escape; keyboard; `aria-expanded`; `role=listbox/option`; `aria-activedescendant` → реальный option id; не clip overflow; z-index; query params

## E5. Сетка каталога

- Приоритет — карточки, не sidebar; фильтр компактный; аккуратный gap; без огромных пустот и без микро-карточек
- Mobile: `minmax(0, 1fr)`, `min-width: 0`, rails не распирают grid; `scrollWidth === innerWidth` на 360/390

## E6. Карточки

Единая вертикаль в ряду: media → control/media rails → collection → title → dimensions → price.

- flex-column / предсказуемый grid; `height: 100%`; цена у низа
- title ≤ 2 строки + reserved height; длинный title не сдвигает цену относительно соседей
- **Reserved rails:** нет swatches/thumbs/вариантов → нейтральная пустая полоса той же высоты (wrapper / min-height / grid rows / placeholder); не «сломанный skeleton»
- Цена не подменяет `request_quote` для BESPOKE
- Hero соответствует товару; lifestyle не вводит в заблуждение другим объектом

## E7. Свотчи / варианты

Клик меняет вариант; active/disabled ясны; hit area (card ~24px visual, PDP ~30px; hit может быть больше); no layout shift; active ring не clip; keyboard focus; aria-label/title; long rails — внутренний scroll только где нужно + fade hint; no page overflow.

## E8. Левая панель фильтров

- Тёплый белый, тонкая рамка, умеренный radius, без тяжёлых теней; не админка/marketplace
- Desktop width ориентир **220–240px**; без overflow-x; без clip названий
- Встроена в сетку; не пересекает powerline `Шоурум`
- Порядок секций: **Коллекции → Тип изделия → Цена**
- Provence в списке, если есть в данных (не хардкод; проверить payload/normalization/facets/tab/count/`Provence` vs `provence`)
- Counts рядом: `Greenwich 15`; gap 8–10px; count secondary; не `space-between` на всю ширину
- Active filters: chips **внутри** filter card (под «Фильтры»), не отдельной строкой над каталогом; один chip-remove
- **Один** global reset (предпочтительно `Сбросить` в заголовке filter card); запрет дублей над каталогом / в блоке цены

## E9. Фильтр цены

- UI: `от` / `до` / разделитель / secondary range helper / одна кнопка `Применить` (уверенная, компактная); layout `minmax(0,1fr) auto minmax(0,1fr)`
- Логика: сохранять прочие query params; вместе с search/sort/collection/type/classification; min-only / max-only / both; reset цены сбрасывает только цену; пересчёт `Найдено`
- Нет цены → не `NaN`, не ломать выдачу; согласовать с request_quote model
- Нужен backend contract → STOP и описать, не молча менять API

## E10. PDP + gallery

- Иерархия: title → collection → price/request_quote → варианты → CTA → описание → характеристики (допустимы адаптации, коммерческая ясность обязательна)
- Desktop: info column может sticky с учётом header; без прыжков при смене варианта
- Mobile: gallery → info; CTA удобен; chips вариантов — auto width + padding (не squish 30×30)
- Gallery: main не пропадает; thumbs ok; stable aspect; no broken/dupes; fallback; main в strip; смена варианта не оставляет мёртвый active image; не «чинить» удалением UX

## E11. Filter sidebar scroll

Desktop sticky / internal vertical scroll ok; не пересекать header; no horizontal scroll; dropdown не clip parent overflow. Mobile — существующий drawer/panel; не изобретать новую mobile-архитектуру без нужды.

## E12. Flow A / Willie Winkie / Molly (устойчивые)

- kids flow; росписи = motifs внутри WW, не случайные SKU;
- kids fields корректны; CTA/price по модели;
- не смешивать исполнения разных продуктов в selectors/media;
- card hero returnable; main image в gallery strip;
- не ломать локальным UI-фиксом.

---

# F. MEDIA OPS (task-specific)

Stages: census → audit → triage → candidate → assignment → review → **apply** → publish.

QA ≠ apply. Default read-only до approval.
Детали Living docs: `docs/operator/README.md`.

---

# G. МОДЕЛИ И CHATGPT-КАК-ПИСАТЕЛЬ-ПРОМПТОВ

## G1. Как отвечает ChatGPT оператору

1. Назвать лучшего исполнителя (+ fallback).
2. 1–3 коротких абзаца «почему».
3. **Один** цельный fenced Markdown prompt для Cursor.
4. При необходимости — второй fence: Codex review prompt.
5. Ожидаемый результат в 2–4 bullets.

Внутри Cursor-prompt обязательны: repo path, модель, цель, проблемы, изменения, scope, запреты, candidate files, audit-first, acceptance, validation, **FORMAT A report**, commit/push policy, блок:

```
Краткое описание задачи простым языком:
- Мы делаем ...
- Это нужно, чтобы ...
```

## G2. Статусы (не смешивать в одно поле Verdict)

| Поле | Значения |
|------|----------|
| **Task status** | `done` \| `partial` \| `blocked` \| `failed` \| `read-only` |
| **Codex commit gate** / **Codex review verdict** | `safe_to_commit` \| `needs_fixes` \| `unsafe_scope` (или domain trio по явному запросу) |
| **Codex reviewer status** | `approve` \| `approve-with-notes` \| `request-changes` \| `not run` \| `pending` |

Пример маппинга: `safe_to_commit` ≈ `approve` / `approve-with-notes`; `needs_fixes` ≈ `request-changes`.

При `request-changes` / `needs_fixes`: remediation → re-check → **потом** FORMAT A.

---

# H. ШАБЛОНЫ

## H1. Cursor executor prompt (вставлять целиком)

```md
# Woodright task

Repo: `/Users/leonidmbp/Documents/projects/furniture-commerce`
Model: <Fable 5 | Sonnet 4.5 | …>

## Краткое описание задачи простым языком
- Мы делаем: …
- Это нужно, чтобы: …

## Цель
…

## Проблемы (факт)
- …

## Требуемые изменения
- …

## Scope
- Входит: …
- Не входит: …

## Запреты
- no git add -A / commit / push без явной просьбы в этом промпте
- no seed / apply / ingest / media apply / DB writes
- no yarn dev / medusa develop автостарт; reuse :3002/:9000 или fallback typecheck
- no redesign языка сайта; no BFF/GraphQL/core fork
- foreground-only; при background prompt → blocked packet

## Docs
- docs/guidelines/development-rules.md
- docs/architecture/architecture-guardrails.md
- docs/project/CODEMAP.md
- docs/ai/RESPONSE_FORMAT.md

## Audit first
1. Fresh git status
2. Найти реальные файлы/потоки
3. Короткий план
4. Затем минимальный diff

## Candidate files (предположение — уточни audit’ом)
- …

## Acceptance
- …

## Validation
- …

## Финальный отчёт
FORMAT A: одна подводка + один fenced `# Woodright report packet`
(включая ## Codex CLI reviewer даже если not run)

## Commit / push
Commit: <запрещён | разрешён pathspec …>
Push: запрещён пока оператор отдельно не скажет
```

## H2. Codex CLI review prompt

```md
# Woodright Codex CLI review (read-only)

Repo: `/Users/leonidmbp/Documents/projects/furniture-commerce`
Mode: review only

## Запреты
- ничего не менять в файлах
- no commit / push / apply / seed

## Scope
Проверь только изменения этой задачи (pathspec / diff vs base):
- …

## Checklist
- secrets / .env / credentials
- scope creep / unrelated dirty
- architecture guardrails (BFF, business logic on FE, BESPOKE cart)
- regressions: catalog / kids / PDP / cart CTA
- media: no accidental apply

## Verdict (ровно один)
- safe_to_commit
- needs_fixes
- unsafe_scope

## Output
Краткий report: verdict + P1/P2/P3 bullets + что проверить оператору.
Артефакт желательно: tmp/.../codex-cli-review.txt
```

---

# I. ПРИОРИТЕТЫ ПРОЕКТА

**Высокий:** buyer storefront, catalog, kids catalog, PDP, media quality, selectors, цены/CTA, Room Sets, media ops tools, data quality.

**Низкий (не уводить без запроса):** payments, mail, sales automation, вторичный backoffice.

---

# J. CHANGELOG относительно исходного ChatGPT-документа

См. конец файла + таблицу предложенных изменений.

---

## Таблица изменений (исходное → предложенное)

| # | Исходное | Предложенное | Зачем | Риск | Тип |
|---|----------|--------------|-------|------|-----|
| 1 | Nav канон Каталог→Комнаты→Детская | Канон сохранён; код = divergence | код ≠ продукт | низкий | **обязательно** (не sync канона с кодом) |
| 2 | Kids green `#628c6a` «принятый» | Tokens `#507356`/`#446249`; литерал `#628c6a` = residual | sync с kids CSS variables | средний (визуальный drift) | **обязательно** зафиксировать факт; унификация — отдельная задача |
| 3 | Отчёт §24 списком 12 пунктов | FORMAT A packet + те же смыслы внутри | единый handoff Cursor↔ChatGPT | низкий | **обязательно** |
| 4 | Codex только `safe_to_commit`… | Два словаря + маппинг | снять конфликт с response-format | низкий | **обязательно** |
| 5 | Fable = FE only; routing media отдельно | C7 decision tree + Media Ops Codex обязателен | меньше ошибок модели | низкий | рекомендуется |
| 6 | Повтор UX §6–15 трижды по смыслу | Слой D сжато + детали без тройного копипаста в `.mdc` | легче исполнять AI | низкий | рекомендуется |
| 7 | «Temporary» смешано с правилами | Явный слой E запрещён в master | меньше галлюцинаций status | низкий | **обязательно** |
| 8 | Нет dual-role ChatGPT vs Cursor | §0.2 + G1 | вы писатель промптов отдельно | низкий | **обязательно** |
| 9 | Нет checklists commit/push | §D1–D3 | git safety исполнима | низкий | **обязательно** |
| 10 | Нет шаблонов prompt | §H1–H2 | copy-ready | низкий | **обязательно** |
| 11 | Ports не зафиксированы | `:3002`/`:9000` hybrid | меньше Docker `:8000` путаницы | низкий | **обязательно** |
| 12 | Repo path неявный | абсолютный path в шаблонах | агенты не пишут не туда | низкий | рекомендуется |
| 13 | Foreground кратко | Ссылка на foreground-only rule + bans | согласовать с Cursor rules | низкий | **обязательно** |
| 14 | Model list без Composer limit на migration | Composer только tiny; migration → не Composer | как model-routing.mdc | низкий | **обязательно** |

### Найденные противоречия (не «улучшения вкуса»)

1. **Nav order** — accepted product vs implementation divergence (канон не менять под код).
2. **Kids green** — документ `#628c6a` vs kids tokens `#507356`.
3. **Формат отчёта** — §24 vs FORMAT A.
4. **Codex verdict names** — commit-gate vs packet.
5. **Codex scope** — расширен §C7 (не только media).

Жёсткие продуктовые решения (BESPOKE/cart, RoomSet, thin client, no BFF, media read-only default, git bans) — **не ослаблялись**.

---

## Changelog (кратко)

- Введены слои A–E; удалены повторы архитектуры/git/media.
- Добавлены decision trees, checklists, prompt templates.
- Nav: accepted `Каталог→Комнаты→Детская→…`; код зафиксирован как divergence.
- Kids color tokens зафиксированы как implementation state.
- Отчёт исполнителя выровнен на FORMAT A; роли ChatGPT/Cursor/Codex — default, не абсолютный запрет.
- Codex §C7: обязателен для commit gate / backend / DB / cart-pricing / media apply / broad refactor / rules / security / high-blast.
- Dual-root: canonical = Documents/projects; thin = mirror.
- Rule precedence §0.0; machine companion: `.cursor/rules/woodright-core.mdc`.
- **2026-07-11 (rules remediation):** alwaysApply stack сжат; user schema precedence; Task status / Codex fields разделены; один Codex table в core; blocked packet order; PR reporting; dual-root canonical-first.
- **2026-07-11 (activation guarantee):** `woodright-response-format.mdc` + `github-access.mdc` → `alwaysApply: true` (compact); obsolete core “manual load” pointers removed.
