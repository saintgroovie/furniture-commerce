# План оптимизации загрузки каталога Woodright

**Статус:** draft / remediating Codex findings (plan-only; no code)
**Дата:** 2026-07-12
**Репозиторий:** `/Users/leonidmbp/Documents/projects/furniture-commerce`
**Область:** `/catalog`, `/kids/catalog` (storefront + необходимые lean-расширения Store API)
**Режим этой итерации:** только план. Код, API, DB, seeds, publish - **не менять**, пока план не принят после Codex review.

**Codex plan review (round 1):** `needs_rules_fixes` / `request-changes`
**Этот документ:** правки плана по findings round 1 внесены ниже. Повторный Codex по плану - перед стартом фазы 0/A.

---

## 1. Цель

Ускорить ощущаемую и измеряемую загрузку каталога (TTFB, wall-time server path, hydrate/network contention, клики по фильтрам) **без потери**:

- ассортимента (все published в scope; без silent drop/leak);
- правил kids / RoomSet exclusivity;
- classification STANDARD / CONFIGURABLE / BESPOKE;
- fidelity фильтров (AND между группами, OR внутри multi-select; **self-excluding facets**);
- качества карточек (hero, execution swatches, metadata-driven media).

Medusa остаётся SoT. Storefront - thin client. Без BFF / GraphQL / microservices / core fork.

---

## 2. Текущий критический путь (as-is)

```text
GET /catalog[?filters]
  → getProducts()                    # Store list; cache: "no-store"
                                     # HYPOTHESIS (не факт): «весь» published list —
                                     # в коде нет явного полного обхода offset/limit;
                                     # проверить count vs полученных ids в фазе 0
  → resolveKidsProducts()
       → getRoomSets()               # list
       → N × getRoomSetBySlug()      # products.* + variants.* (ради ids на /catalog)
       → сегодня: ошибки detail часто глотаются → неполный Set (fail-open на /catalog)
  → scope / applyCatalogFilters
  → buildCatalogFacets × 4           # 4 вызова; каждый facet должен остаться self-excluding
  → SSR ProductCard × N              # heavy execution selectors
  → hydrate: ≤12 Image() probe/card + canvas swatches
Клик фильтра → router.push → весь путь заново
```

Ключевые файлы:

| Слой | Файл |
|------|------|
| Страницы | `apps/storefront/src/app/catalog/page.tsx`, `kids/catalog/page.tsx` |
| Fetch | `apps/storefront/src/lib/api/base.ts` (`cache: "no-store"`), `products.ts`, `room-sets.ts` |
| Kids | `apps/storefront/src/lib/kids.ts` (`resolveKidsProducts`) |
| Фильтры | `catalog-filters.ts`, `catalog-filter-controls.tsx` |
| RoomSet API | `apps/backend/src/api/store/room-sets/[slug]/route.ts` |

---

## 3. Инварианты (нельзя нарушить)

1. Medusa = source of truth; storefront не дублирует бизнес-логику.
2. RoomSet - отдельная entity; kids exclusivity через room_type / items.
3. Kids = navigation layer (`kids.ts`), не ProductClassification.
4. BESPOKE на `/catalog` - fail-closed; cart middleware не трогать в этом плане.
5. Фильтры: AND между группами, OR внутри multi-select; facets **self-excluding** (каждый facet считается при применённых остальных группах).
6. Не скрывать published SKU и не отключать execution swatches без эквивалентного покрытия metadata.
7. Нет seed / apply / DB write / publish в рамках оптимизации.
8. Нет `git add -A`; dirty-tree - только scoped pathspecs при будущем коммите.
9. **Kids exclusion на `/catalog` - fail-closed:** если membership/RoomSet resolve недостоверен (list fail, любой обязательный detail/lean fail, timeout) → **error UI / не показывать «успешный» main catalog**, а не `kidsIds = empty Set` (иначе kids-only товары утекут на `/catalog`).
10. Общий `medusaFetch` не переводить на cache целиком; cart/checkout остаются `no-store`.

---

## 4. Фазы работ

Каждая фаза = отдельный PR-кандидат, со своим DoD, рисками и контролем. Следующая фаза не стартует без green gate предыдущей.

### Фаза 0 - Baseline (обязательна до кода)

**Что сделать**

- Зафиксировать метрики на локальном стенде (`:3002` + `:9000`), без автостарта серверов:
  - wall-time server path (логи / temporary timing - только в tmp);
  - число HTTP к Medusa на один `/catalog` и один `/kids/catalog`;
  - размер JSON `/store/products` и суммарный размер N × `/store/room-sets/:slug`;
  - размер SSR/RSC payload каталога; отдельно отметить CPU path карточек;
  - LCP / TTFB (Playwright / Performance API), cold + warm.
- **Полнота store list (P0 до оптимизаций):**
  - сверить Store API `count` (или admin count published) с числом полученных product ids;
  - если есть `limit`/`offset` - задокументировать и при необходимости описать полный обход пагинации как **предусловие** фаз A/B (не оптимизация, а корректность baseline);
  - без доказанной полноты snapshots фиксируют уже усечённый ассортимент - **stop**.
- Baseline membership: kids RoomSet product ids, non-kids RoomSet product ids, итоговые `/catalog` и `/kids/catalog` id-sets.
- Fault fixtures (описание сценариев для gate, не обязательно автоматизация в фазе 0): room-set list fail; один detail fail; timeout; рассинхрон products vs RoomSet.
- 3 сценария perf: cold `/catalog`, cold `/kids/catalog`, 5 кликов фильтров.
- Fixture handles (≥6): STANDARD, CONFIGURABLE+swatches, kids, no image, long title, display group.

**DoD фазы 0**

- Таблица baseline в `tmp/catalog-perf-baseline.md` (не коммитить секреты).
- Явный вердикт: store list **полный** / **усечён** (+ план пагинации, если усечён).
- Membership + scoped id-sets сняты.
- Контрольные handles согласованы.

**Риск:** шумный baseline; ложная «полнота».
**Контроль:** 3 прогона, медиана; одна DB; count↔ids; без параллельной нагрузки.

---

### Фаза A - Parallel fetch (quick win)

**Что сделать**

- Разделить **независимый membership fetch** (room-sets list + details/lean ids) и **rehydrate** из `storeProducts`.
- Стартовать `getProducts` и membership fetch **параллельно**, где нет data-зависимости.
- Семантика union/exclusion - bit-identical с pre-change на той же DB.
- **Запрещено** закреплять или копировать fail-open: `fail kids → empty Set` на `/catalog`.

**Поведение при ошибках (обязательно)**

| Ситуация | Поведение |
|----------|-----------|
| `getProducts` fail | error UI каталога (как сейчас) |
| room-set list fail | fail-closed: error / unavailable kids-exclusion (не пустой Set) |
| любой обязательный detail/lean fail или timeout | fail-closed: весь membership resolve недостоверен → не успешный `/catalog` с «частичным» kidsIds |
| частичный успех N−1 из N | **запрещён** для production path оптимизации |

**Ожидаемый выигрыш:** измеряется после фазы 0 (без заранее зафиксированных −30–50%). Цель - снижение wall-time критического пути при том же id-set.

**Риски и контроль**

| Риск | Контроль |
|------|----------|
| Fail-open kids leak | Fail-closed policy + fault-injection test |
| Race / двойной getProducts | Один storeProducts; тест resolver |
| Регресс exclusivity | Equality id-sets до/после (не subset) |

**DoD:** wall-time ≤ baseline (лучше); id-sets `/catalog` и `/kids/catalog` **равны** pre-change; fault-injection: list/detail fail не открывает kids на main.

**Вне scope:** API fields, cache, клиентские фильтры.

---

### Фаза B - Lean RoomSet ids для `/catalog`

**Проблема:** `[slug]` тянет `products.*` + `variants.*`, а для exclusion/membership нужны в основном **product id**.

**Контракт (фиксированный, не произвольный fields passthrough)**

- **B1 (выбранный путь):** отдельный query mode / route с **жёсткой** проекцией только `item → product.id`
  Пример: `GET /store/room-sets/:slug?view=product_ids` или отдельный lean handler.
  Default detail contract (`products.*` / `variants.*`) - **без изменений** (rooms / полные потребители).
- **B2 (если B1 мало):** list active sets с `product_ids[]` одним round-trip - отдельный follow-up PR.

**Rehydrate**

- Membership = ids из RoomSet lean/detail.
- Карточки `/catalog` и `/kids/catalog` собираются из **полного published `storeProducts`** по id (после доказанной полноты list в фазе 0).
- Не использовать урезанный RoomSet product payload как SoT карточки.

**Контроль эквивалентности (не subset)**

1. kids membership set (lean) === kids membership set (full detail resolver).
2. non-kids membership set ===.
3. итоговый `/catalog` id-set ===.
4. итоговый `/kids/catalog` id-set ===.
5. Пересечение с published store set - только после построения membership (не «lean ⊆ store» как единственный критерий).

**Риски и контроль**

| Риск | Контроль |
|------|----------|
| Слом `/rooms` | Lean только opt-in; default detail не менять; smoke `/rooms`, `/kids/rooms` |
| Silent drop/leak ids | Equality sets + fault-injection |
| `/kids/catalog` потеря полей карточки | Rehydrate из store list; визуальный fixture |

**DoD:** payload RoomSet-хвоста ↓; equality id-sets; rooms smoke OK.

**Codex gate:** **обязателен** (Store API).

---

### Фаза C - Facets без лишней работы

**Что сделать**

- Убрать 4 независимых «с нуля» прохода, сохранив **self-excluding** семантику: для facet group G все остальные группы применены, G - нет.
- Рефакторинг может шарить промежуточные pool'ы, но не сводить всё к одному уже отфильтрованному массиву.

**Ожидаемый выигрыш:** CPU SSR (малый vs сеть).

**Риски и контроль**

| Риск | Контроль |
|------|----------|
| Слом self-excluding counts | fidelity tests + snapshot facet JSON на ≥5 filter states |
| OR/AND drift | не менять `applyCatalogFilters` semantics |

**DoD:** fidelity green; facet counts === baseline на тех же searchParams.

---

### Фаза D - Read cache TTL (только после политики)

**Входные условия (обязательны до кода фазы D)**

1. Утверждённая оператором stale-policy (макс. TTL, что допустимо после publish).
2. **Рабочая invalidation** каталожных reads (tag/path revalidate или эквивалент) - обязательна, не follow-up и не заменяется kill-switch.
3. Kill-switch (`CATALOG_REVALIDATE_SECONDS=0` / env off) - **дополнительный** предохранитель поверх invalidation, не вместо неё.
4. Отдельный `medusaCatalogFetch` (или allowlist) - **не** менять общий `medusaFetch` и не трогать cart middleware.

**Что сделать**

- Cache только catalog GETs (products list lean, room-sets list/lean) с согласованным TTL/tag.
- Согласованность products ↔ room-sets: одна политика инвалидации; не считать «один tag» автоматической атомарностью без проверки.

**Stop if:** оператор запрещает любой stale; нет утверждённой policy; нет рабочей invalidation; нет kill-switch как доп. предохранителя.

**Codex gate:** **обязателен**.

---

### Фаза E - Клиентская фильтрация после первого SSR

**Что сделать**

- Первый load: scoped serializable payload + facets.
- Клики: URL + те же pure helpers на клиенте; без Medusa refetch.
- Payload уже scoped (main без kids); kids page - свой payload.

**Риски:** hydration mismatch, RSC size, exclusivity leak - controls как ранее + size budget vs baseline.

**Codex gate:** рекомендован.

---

### Фаза F - Card image probes

- Card-only: лимит 3–4 или IntersectionObserver/hover; PDP strip не в том же PR.
- DoD: меньше parallel image requests; fixture cards OK.

---

### Фазы G+ (бэклог)

| Фаза | Суть | Почему позже |
|------|------|----------------|
| G | Batch list `product_ids` | После B1, если N ещё велик |
| H | `next/image` + CDN | Infra blast |
| I | Pagination / virtualize | Нужен facet aggregate по полному set |
| J | Materialized kids ids | Высокий SoT-риск; только после доказанной эквивалентности |

---

## 5. Рекомендуемый порядок

```text
0 Baseline (+ pagination completeness verdict)
  → A Parallel fetch + fail-closed membership
  → C Facets (self-excluding preserved)     # можно одним PR с A, если diff мал
  → B Fixed lean product_ids contract      # Codex обязателен
  → F Card probes
  → D Cache TTL                            # только после операторской policy
  → E Client-side filters
```

**Первый пакет после approve плана:** `0 → A → C → B`
**Не в первом пакете:** D, E, H–J.

---

## 6. Матрица рисков (сводка)

| ID | Риск | Фазы | Sev | Контроль | Stop if |
|----|------|------|-----|----------|---------|
| R1 | Kids leak via empty Set / partial resolve | A, B, E | P0 | Fail-closed + fault-injection | любой успешный `/catalog` при недостоверном membership |
| R2 | Incomplete store pagination | 0, A, B | P0 | count↔ids; полный обход | усечённый list без плана пагинации |
| R3 | Silent id drop (subset-only checks) | B | P0 | Equality membership + scoped sets | любой diff id-set |
| R4 | Filter / facet fidelity | C, E | P0 | fidelity + self-excluding snapshots | failing test |
| R5 | Stale после publish | D | P1 | Policy + invalidate/kill-switch | нет policy |
| R6 | Слом `/rooms` lean default | B | P0 | Opt-in lean only | rooms smoke fail |
| R7 | Cache cart | D | P0 | Separate catalog fetch | cart cached |
| R8 | Визуальный регресс карточек | F, E | P1 | Fixture screenshots | явный UX regress |
| R9 | Scope creep / dirty tree | all | P1 | Pathspec + Codex | unrelated files |

---

## 7. Validation gate (на каждую фазу)

1. Scoped tests: catalog-filter fidelity, kids helpers.
2. **Fault-injection:** room-set list fail; один detail/lean fail; timeout - ожидаемое fail-closed поведение.
3. Manual smoke: `/catalog`, `/kids/catalog`, 3 фильтра, 1 sort, 2 PDP, `/rooms`.
4. Perf: те же 3 сценария; Δ к baseline.
5. id-set dump (tmp): equality до/после для main + kids + membership.
6. Фазы B/D: Codex → `safe_to_commit` / notes / needs_fixes.
7. Нет изменений цен, classification, publication, seeds.

---

## 8. Out of scope

- Редизайн UI фильтров.
- Kids → ProductClassification.
- Production publish / Media Ops apply.
- Глобальный cache на весь `medusaFetch`.
- Force push / amend чужих коммитов.

---

## 9. Критерий успеха (после A+B+C+F)

На той же DB/стенде:

- cold `/catalog` wall-time server path лучше baseline (цель уточняется после фазы 0; **без** заранее обещанных −30–50%);
- Medusa HTTP: нет N full RoomSet product graphs для exclusion (lean/fixed contract);
- id-sets и fidelity - без регрессий; fault-injection fail-closed;
- fixture cards - без потери swatches/hero;
- store list полнота доказана или пагинация закрыта.

---

## 10. Next safe step

1. Повторный Codex review **этого** плана (после remediation round 1).
2. При `safe_to_adopt` / `approve` / `approve-with-notes` - **только фаза 0 (baseline)**, без продуктовых правок.
3. Затем PR A (+C), с fail-closed и equality gates.

**Сейчас (по запросу оператора до отдельного approve на код): реализацию не начинать.**
