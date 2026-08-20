# OD-02 Delivery / lift / assembly - verification (canonical)

**Date:** 2026-08-15 (Europe/Moscow); **ratified 2026-08-17**
**Mode:** evidence pack + owner ratification. Buyer-facing storefront copy **not** changed in this task.

**Ratification:** `OD-02 = B` · `OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY` · `WOODRIGHT_OD02_DELIVERY_QUOTE_ONLY_OWNER_RATIFIED`

Related closed: `OD-01 = A`, `OD-05 = A`, `OD-10 = B`. Full legal pack **not** approved. Geography / lift / assembly / pickup **not** ratified here. `OD-06` split 2026-08-20 (`20260820_LAUNCH_COMPLETION.md`): submit ≠ acceptance; no extra claims SLA.

---

## Owner ratification (2026-08-17)

```text
OD-02 = B — OWNER CONFIRMED
DELIVERY_MODEL = QUOTE_ONLY
PUBLIC_DELIVERY_TARIFF = NO
PUBLIC_FIXED_DELIVERY_TARIFF = NO
CHECKOUT_DELIVERY_PRICE_IS_NOT_COMMERCIAL_SOT = YES
CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL
DELIVERY_TERMS_CONFIRMED_BY_MANAGER = YES
DELIVERY_TERMS_CONFIRMED_BEFORE_PAYMENT = YES
LEGACY_DELIVERY_TARIFFS = NOT NEW-SITE SOT
/delivery = READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS
```

Canonical COPY (SoT only; **not** implemented):

> Стоимость и условия доставки зависят от адреса и состава заказа. После оформления менеджер проверит детали и согласует условия до оплаты.

Do **not** write: free delivery from checkout `0 ₽`; geography; lift; assembly; pickup; «по всей России».

The 2026-08-15 research below is **historical evidence**. It is not an open choice between legacy tariffs.

---

## Verdict

```text
CURRENT_TARIFF_SOT = NOT FOUND
LIVE_LEGACY != NEW-SITE SOT
CHECKOUT_SHIPPING_PRICE = 0 (plumbing; CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL)
DELIVERY_PRICE_CALCULATED_ON_SITE = NO
OD-02 = B — OWNER CONFIRMED (2026-08-17)
OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY
```

No 2025-2026 internal price sheet / Excel / approved commercial policy for delivery, lift, or assembly was found in canonical docs, storefront, backend, rem legal pack, or known commercial folders. Canonical repo has **zero** `.xlsx` / `.xls`. The CS-Cart dump (02 Jun 2025) holds **historical** page bodies only.

Live `https://woodright.ru/dostavka-i-sborka/` re-probe on 2026-08-15 **timed out** (0 bytes). Last successful public observation: **2026-08-12** (night audit) - same ₽/% family as dump RU page.

---

## Current operational model (HIGH for process; not for ₽)

Canonical checkout + backend bootstrap:

1. Buyer submits name + phone (address optional). Copy: address confirmed by manager on the call.
2. Storefront auto-attaches the **first** shipping option (`checkout.ts`). Buyer does **not** choose delivery vs pickup.
3. Bootstrap option: name **«Доставка согласуется менеджером»**, type `manager_delivery`, label «Договорная», description «Стоимость доставки согласуется с менеджером», **flat `amount: 0` RUB**, fulfillment `manual_manual`, geo zone **country RU**.
4. Order completes with **no delivery fee in checkout total**.
5. `OD-05 = A`: manager confirms the order, then sends PaymentLink / invoice. Delivery terms naturally sit in that confirmation **before** payment - this is the **implemented journey**, not a separate coded delivery gate.

`pp_system_default` / zero shipping are **Medusa plumbing**, not a promise of free delivery. Owner 2026-08-17: `CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL`.

---

## Delivery matrix

| Service | Available? | Geography | Pricing | Evidence | Age | Confidence | Conflict | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Доставка (as a post-order service) | Yes as **process** | Unspecified to buyer; Medusa zone = RU | Quote after order; 0 ₽ at checkout | `ensure-checkout-ready.ts`; checkout copy | 2026 code | HIGH process | vs live ₽/% | current ops |
| Доставка Москва / внутри МКАД / за МКАД / МО | Unknown as current policy | Legacy texts only | Legacy 2000 / 1000+50 | live + LEG page 26 | ≤2025 dump / live 2026-08 | LOW as current | vs 1% dogovor | `REJECT AS NEW-SITE SOT` |
| Другие регионы / ТК | Mentioned in **legacy** public page (buyer pays carrier) | RF | Unknown now | live `/dostavka-i-sborka/` | live/legacy | LOW | - | `UNVERIFIED LEGACY` |
| Who delivers (own / contractor / mix) | **MISSING** | - | - | not in new stack | - | - | - | `MISSING` |
| Разгрузка | **MISSING** as current | - | - | - | - | - | - | `MISSING` |
| Занос | Legacy 0,5%/50 m | - | % of order | live + LEG | legacy | LOW | - | `REJECT AS NEW-SITE SOT` |
| Подъём с лифтом | Legacy 0,7% | - | % of order | live + LEG | legacy | LOW | - | `REJECT AS NEW-SITE SOT` |
| Подъём вручную / этаж | Legacy 0,5%/floor; spiral 1,5% | - | % | live + LEG | legacy | LOW | - | `REJECT AS NEW-SITE SOT` |
| Сборка у клиента | Discussed in checkout copy; **no current tariff** | Unknown | Unknown | `woodright-copy` «доставке и сборке» | 2026 copy | MEDIUM that it is a conversation; LOW that it is a priced SKU | vs 3% | `PARTIAL` / OD-02+OD-08 |
| Монтаж / панели / Bespoke install | **MISSING** as current service terms | - | - | footer/media only | - | - | - | OD-08; do not fold into OD-02 |
| Самовывоз | Rem legal: showroom by appointment | Khimki showroom | Unknown if free | rem `legal-content.ts`; no pickup option in checkout | 2026 rem draft | MEDIUM process, not owner-confirmed | hours OD-07 | `PARTIAL` |

---

## Legacy tariff records

All four numbers share one historical family (CS-Cart static pages + dump 02 Jun 2025 + still-live `woodright.ru`). Live + SQL + old markdown copies are **duplicates**, not independent confirmation.

### `2000 ₽`

- Meaning: Moscow delivery (public «Доставка и сборка»).
- Sources: live `/dostavka-i-sborka/` (probed 2026-08-12); LEG-SQL page 26.
- Geography: Москва.
- Retail page (not proven as 2026 ops sheet).
- Current corroboration in new stack: **none**.
- Verdict: **`REJECT AS NEW-SITE SOT`** (`STALE` / `UNVERIFIED LEGACY`).

### `1000 ₽ + 50 ₽/км`

- Meaning: МО from MKAD (fixed + per km).
- Same public page / dump. Duplicate of 2000-₽ page.
- Verdict: **`REJECT AS NEW-SITE SOT`**.

### `3%`

- Meaning on that page: «полная сборка и установка … 3% от суммы заказа».
- Does **not** say after-discount vs list, or furniture-only vs whole order, beyond «суммы заказа».
- Same source family. Checkout copy does **not** repeat 3%.
- Verdict: **`REJECT AS NEW-SITE SOT`**. Does not prove assembly is currently offered.

### `1%`

- Meaning: **delivery**, not assembly. Dump has **more than one** 1% delivery clause:
  - dogovor: 1% of **contract** in presence cities (variant A: Москва и область, Иваново, hours 8-18; variant B: adds СПб/ЕКБ/Ульяновск, hours 8-21);
  - page 26 `lang=en` body is still Russian: 1% of **order** for Москва, СПб, Екатеринбург, Ульяновск, Иваново; carrier named «ЖДЭ».
- A separate **lift** line uses 1%/floor for a spiral stair (not the same as delivery 1%).
- Conflicts with RU public 2000 ₽ table (CF-01). Not independent current corroboration.
- Verdict: **`REJECT AS NEW-SITE SOT`** + **`CONFLICT`**.

Lift % (0,7 / 0,5 / 1,5) and carry-in 0,5%/50 m: same public page family → **`REJECT AS NEW-SITE SOT`**.

Other dump claims, **not** current SoT: homepage motivation «своим транспортом» Москва/МО и СПб/область + сборка; CS-Cart sticker template «бесплатная доставка от 10000 руб» (addon, not a Woodright policy sheet); PECOM language strings (plugin i18n). Do not treat as independent 2026 confirmation.

Dogovor also states delivery does **not** include lift/install (agreed separately) - semantic split DELIVERY vs LIFT vs ASSEMBLY exists in legacy contract, but numbers remain stale.

---

## Who / what (honest gaps)

| Question | Answer |
| --- | --- |
| Does Woodright deliver now? | **Process yes** (manager-agreed delivery). Fleet/contractor **MISSING**. |
| Geography for launch copy | **Not owner-confirmed.** Code zone is RU; that is not a buyer promise of nationwide delivery. |
| Separate delivery fee | Yes in **intent** (quoted later). Not in checkout total. |
| Lift exists now? | **MISSING** as current policy. Legacy % rejected. |
| Assembly exists now? | **PARTIAL**: copy says manager will discuss assembly. No who / where / price / optional-vs-included. |
| Serial vs Bespoke assembly | **Unknown** - do not merge. OD-08 for panels / turn-key / measurement. |
| Pickup | Rem draft: showroom by appointment. Checkout has **no** pickup method. Hours still OD-07. |
| When buyer learns price | After manager review, **before** PaymentLink (`OD-05`). HIGH as intended journey. |
| Date of delivery | **MISSING** (no SLA, no calendar in new stack). |

---

## Buyer questions

| Question | Status |
| --- | --- |
| Доставляете? | `PARTIAL` / process yes; fleet `MISSING` |
| Куда? | `MISSING` / owner input required (not implied by OD-02 = B) |
| Сколько стоит? | `ANSWERABLE` (quote-only; manager before payment) |
| За МКАД / регионы? | `MISSING` / owner input required |
| Подъём / нет лифта / входит ли? | `MISSING` current; legacy `REJECT` |
| Сборка / кто / цена / без сборки? | `PARTIAL` / `UNRESOLVED` |
| Самовывоз? | `PARTIAL` - depends on OD-07 |
| Когда узнаю стоимость / до заказа платить доставку? | `ANSWERABLE` (OD-02 + OD-05): not on checkout; with confirmation, before pay |
| Дата? | `MISSING` |

---

## Candidate classification

**A — Published tariff table:** not available. No authoritative current sheet.

**B — Quote-only:** matches checkout plumbing, rem honesty, OD-05 sequence, and absence of a current ₽ SoT.

**C — Hybrid:** not evidenced (no confirmed free/fixed MKAD zone).

**D — Other:** not needed.

Recommended for owner: **B**, plus optional compact geography/lift/assembly facts **if** owner supplies them in the same answer. Quote-only ≠ hide that delivery exists.

**2026-08-17:** owner chose **B**. Geography / lift / assembly were **not** supplied in the ratification. Those gaps remain.

---

## Owner token

```text
OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY
WOODRIGHT_OD02_DELIVERY_QUOTE_ONLY_OWNER_RATIFIED
```

Recorded as accepted 2026-08-17. Not a geography/lift/assembly/pickup confirmation.

---

## COPY candidate (not shipped)

Owner-confirmed sense (2026-08-17):

> Стоимость и условия доставки зависят от адреса и состава заказа. После оформления менеджер проверит детали и согласует условия до оплаты.

Do not add: ₽, %, МКАД, «удобное время», «бережно», «профессиональные сборщики», lift/assembly as services, free delivery, nationwide.

---

## IA (does not close OD-11)

**Recommend variant 1:** one `/delivery` hub (how it works → pickup if confirmed → FAQ). Do **not** split `/services` until OD-08 has real services. Lift/assembly H2 only after owner says those services exist.

---

## OD-08 / Bespoke

Not ratified here. Panels, measurement, «под ключ», wall install remain OD-08 / Bespoke. Factory «аккуратная сборка» in about/production ≠ home assembly.
