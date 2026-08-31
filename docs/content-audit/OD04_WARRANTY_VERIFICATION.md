# OD-04 Warranty — verification (canonical)

**Launch status 2026-08-20:** commercial term 12 months unchanged. OD-08 on-site services are unpublished, not a remaining owner-open launch gate. See `20260820_LAUNCH_COMPLETION.md`.

Related closed: `OD-01 = A`, `OD-02 = B`, `OD-03 = B`, `OD-04 = B`, `OD-05 = A`, `OD-10 = B`.
Related open: `OD-06` split (`OD-06A` / `OD-06B`). Do not close SLA here. Do not treat the 2026 Word template 18-month term as current website SoT.

```text
BEFORE OWNER DECISION:
HISTORICAL CURRENT SOT BEFORE OWNER DECISION = NOT FOUND

AFTER OWNER DECISION:
CURRENT OWNER-SET COMMERCIAL WARRANTY TERM = 12 MONTHS
OD-04 = B
WARRANTY_TERM_SOURCE = CURRENT OWNER DECISION
LEGACY_18_MONTHS = NOT NEW-SITE SOT
LEGACY_GENERIC_12_MONTHS = NOT SOURCE OF CURRENT DECISION
PRODUCT LABEL != AUTOMATIC WARRANTY TERM
BESPOKE LABEL != AUTOMATIC WARRANTY TERM
COMMERCIAL WARRANTY != STATUTORY DEFECT RIGHTS
STATUTORY_DEFECT_RIGHTS = PRESERVED
```

---

## Owner ratification (2026-08-19)

```text
OWNER CONFIRMED
OD-04 = B
COMMERCIAL_WARRANTY_TERM = 12 MONTHS
PUBLIC_COMMERCIAL_WARRANTY_TERM = 12 MONTHS
WARRANTY_TERM_SOURCE = CURRENT OWNER DECISION
TOKEN = OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET
WOODRIGHT_OD04_WARRANTY_12_MONTHS_OWNER_RATIFIED
```

**Provenance:** explicit owner decision **2026-08-19**. `FACT — CURRENT OWNER CONFIRMED` for the **12-month commercial term only**.

**Not provenance:** live `/oferta/` 18 months; dogovor 18 months; CS-Cart theme 12 months; dump EN oferta/dogovor of ИП Елисеев. Coincidence of the digit 12 does **not** make the generic template authoritative.

This **B** is a **new owner-set launch rule**. It is not research Candidate B («a different current operational term was found»). Research below remains historically correct: before this decision the approved SoT was `NOT FOUND`, and the research recommendation was **C**.

**Confirmed by this ratification:** public commercial term = 12 months. Neutral buyer phrasing: «Гарантия Woodright» until obligor wording is reviewed.

**Not confirmed:** start point; manufacturer name; obligor legal wording; hardware / mechanisms / upholstery / finish / third-party / wall-panel separate terms; legacy exclusions; claims SOP; claims email; claims SLA (`OD-06`). STANDARD / CONFIGURABLE / BESPOKE do not get different terms from the product label. Contract-specific Bespoke exceptions, if any, must be written separately.

`/warranty` = **READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW** (not production). COPY below is **not implemented**.

---

## Historical research verdict (2026-08-19, before owner decision)

Do not rewrite this as if the 12-month launch term already existed.

```text
WOODRIGHT_APPROVED_WARRANTY_POLICY = NOT FOUND   ← historical, before owner decision
CURRENT_WARRANTY_TALON = NOT FOUND
CURRENT_WARRANTY_CLAIMS_SOP = MISSING
LIVE_OFERTA_STILL_PUBLISHES_18_MONTHS = YES (2026-08-19)
REMEDIATION_/warranty = FAIL-CLOSED STUB (no number)
CANONICAL_STOREFRONT_/warranty = NO ROUTE
OWNER_LEGAL_WARRANTY_TERMS env = empty (rem)
RESEARCH_RECOMMENDATION = C
```

**Historical Current Warranty SoT (approved / operational, before owner decision):** `NOT FOUND`.
**Research picture:** strong **legacy/public** 18-month claim; incomplete scope, obligor, exclusions, and current manager practice. Statutory defect rights ≠ a found commercial term.

---

## Three layers (do not collapse)

| Layer | What it is | After OD-04 = B |
| --- | --- | --- |
| Commercial warranty | Voluntary term Woodright sets | **12 months** owner-set 2026-08-19. Not legacy 18m. Not generic dump 12m |
| Statutory consumer rights | ЗоЗПП / ГК on defects, independent of a published «гарантия» | `EXTERNAL VERIFICATION`; **preserved**; 12 months is not a blanket limit |
| Buyer-facing explanation | Future `/warranty` | READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW; term may be stated; start/obligor/exclusions still review |

Do not use «гарантия» as the name of all defect rights.

---

## Exact source trace — `18 месяцев`

Probed **2026-08-19**. Same wording in live HTML and dump Jun 2025 (`LEG-SQL`).

### 1. Live `/oferta/` annex (primary 18-month sentence)

**URL:** `https://woodright.ru/oferta/` HTTP 200. Oferta header: действует с **01.05.2022**.

**Wording:**

> Гарантийный срок производителя на все изделия (далее - товар) составляет 18 месяцев с момента передачи товара Покупателю или Представителю. Данная гарантия применима в случаях обнаружения дефектов материалов или производственного брака изделий.

| Field | Finding |
| --- | --- |
| Obligor in this sentence | **производитель** (not named as a legal entity) |
| Scope | «все изделия»; limited to **materials / manufacturing defects** |
| Start | **передача** покупателю или представителю |
| Date/version | Oferta from **01.05.2022**; still served 2026-08-19 |
| Talon | **Not mentioned** (`талон` count 0 in live oferta body) |
| In contract | Yes: listed as annex «Гарантийные обязательства…» |
| In instructions | Same page also embeds care / assembly / «паспорт» language |
| Duplicate | Dump page body (line ~57955) = same HTML |

### 2. Same live `/oferta/` §12 (same document, different rule)

**12.1:** гарантийный срок эксплуатации **устанавливает производитель**; срок **на этикетке**.
**12.2:** срок **не распространяется** на аксессуары (наматрасники, подушки, чехлы, одеяла, постельное бельё и т.д.) **и фурнитуру**, если иное не указано в приложении / этикетке / паспорте.
**12.3:** exclusions: нарушение эксплуатации/ухода; не по назначению; умышленное повреждение / непреодолимая сила; механические повреждения; следы самостоятельного ремонта или изменения конструкции.

**Internal tension (same page):** §12.1 = look at the label; annex = 18 months on all products; §12.2 = hardware/accessories carved out.

### 3. Live `/dogovor-postavki/` §5.4 (seller, not manufacturer)

**URL:** `https://woodright.ru/dogovor-postavki/` HTTP 200.

**Wording:**

> Гарантийный срок, предоставляемый **Продавцом** на все продаваемые им предметы мебели, при соблюдении правил эксплуатации, опубликованных на сайте Продавца https://wdrt.ru/pravila-ekspluatacii/ составляет **18 (Восемнадцать) месяцев с момента передачи Товара**.

Dump RU page (line ~57759) matches. Care URL is legacy host `wdrt.ru`.

**§5.6:** гарантийное обслуживание **не производится** при доставке / подъёме / сборке силами покупателя или третьих лиц, **кроме** производственного брака; плюс нарушение эксплуатации; механика; умысел; третьи лица.

Status of §5.6 for new site: **`SUSPECT / LEGAL REVIEW`**. OD-02 did not confirm current assembly. OD-08 remains OPEN. Do not port a blanket self-assembly / third-party install kill-switch.

### 4. CS-Cart PDP motivation badge

Dump `cscart_ab__mb_motivation_item_descriptions` id **9** `ru`: name `Гарантия`, body `<p>18 месяцев</p>`. Theme chrome, not a policy document.

### 5. Service life (not the same legal object)

Same live oferta annex:

- кровати/изголовья: **срок службы 18 месяцев**
- диван/тахта/кресло-кровать/кушетка/кресло/пуф: **срок службы 18 месяцев**

ЗоЗПП ст. 5: **срок службы ≠ гарантийный срок**. 18 months as furniture **service life** is unusually short and may be copy-paste of the warranty number. **Do not publish as current SoT.** `LEGAL REVIEW` if anyone treats it as a real service-life cap.

---

## Other warranty terms found

| Term | Source | Age | Classification |
| --- | --- | --- | --- |
| **18 months** manufacturer, all products, materials/defect | Live `/oferta/` annex + dump | 2022 oferta, still live 2026 | Main legacy commercial claim |
| **18 months** seller, all furniture | Live `/dogovor-postavki/` §5.4 + dump | dump Jun 2025 / live 2026 | Same number, **different obligor** |
| **12 months** seller, all goods | Dump **EN** `cscart_page_descriptions` page_id **27** «Оферта»: **ИП Елисеев Андрей Александрович**, `www.wdrt.ru` / `woodright-kids.ru` | Historical other-entity locale copy | **`STALE` / other seller** — not current OD-01 seller |
| **12 months** «на все купленные товары» | Dump UniTheme motivation id **3** «Наши преимущества» (typos, 14-day return tooltip) | CS-Cart generic | **`GENERIC TEMPLATE`** (same family as Demo Magazin) |
| **12 months** seller, dump EN dogovor page_id **25** | Same EN block as ИП Елисеев dogovor | Historical | **`STALE` / other seller** |
| 24 / 36 months | Live + dump search | - | **Not found** |
| Hardware supplier warranty | - | - | **`MISSING`** |
| Mattress-specific commercial term | Oferta lists mattresses in annex titles; §12.2 accessories carve-out | - | **`MISSING` as a separate current term** |
| Wall-panel warranty | Legacy SKU/SEO and project mentions only | - | **`MISSING`**. Do not invent. OD-08 still OPEN |

**12 vs 18** was a **lineage** conflict (live RU 18 vs EN dump / theme 12), not two current Woodright policies. After **OD-04 = B**, neither legacy number is current SoT. Launch term = **12 months owner-set**. Live RU 18 months, if still printed, is `LEGACY PUBLIC DIVERGENCE`. Generic dump 12 months remains `STALE / GENERIC TEMPLATE` and is **not** the source of OD-04.

---

## Seller / manufacturer / obligor

| Role | Current finding |
| --- | --- |
| Seller (new site) | ООО «Роэл-Техник» — `OD-01 = A` `FACT — CURRENT OWNER CONFIRMED` |
| Live oferta §1.1 | ООО «Роэл-Техник» |
| Live oferta §15 | still prints **ЗАО «Роэл-Техник»** (legacy entity chrome) — identity for new site is **not** reopened; `OD-01 = A` stands |
| Manufacturer / изготовитель legal name | **Not stated.** Documents say «производитель», «фабрика-производитель», «маркировочные ярлыки производителя». **Do not invent.** `MANUFACTURER = NOT YET CONFIRMED` |
| Warranty obligor in texts | **Conflict:** annex = manufacturer; dogovor = seller; §12.1 = manufacturer via label. `WARRANTY_OBLIGOR_LEGAL_WORDING = LEGAL REVIEW`. OD-04 = B does **not** resolve this. Do not publish «гарантия производителя» |
| Same-entity assumption | Brand Woodright ≠ proven legal identity of manufacturer. `LEGAL REVIEW` |

---

## Start of term

| Rule | Source | Confidence as *current policy* |
| --- | --- | --- |
| From **transfer** to buyer or representative | Live oferta annex | High as **published**; not owner-confirmed |
| From **transfer** of goods | Live dogovor §5.4 | Same |
| From sale / delivery / assembly / act / payment as *the* start | Not found as the 18-month clock | Assembly mentioned as **condition** (dogovor 5.6; oferta «после сборки считается в эксплуатации»), not as start of the 18 months |
| Current approved start rule | Owner did **not** set a start in OD-04 = B | **`WARRANTY_START = LEGAL REVIEW / CONTENT COMPLETION`**. Do not publish «12 месяцев с момента передачи» yet |

Default statutory clock if a warranty exists: ЗоЗПП ст. 19 / ГК ст. 477 — generally from transfer unless contract says otherwise (`EXTERNAL VERIFICATION`).

---

## Scope matrix (evidence, not a new policy)

OD-04 = B sets a **base public term of 12 months**. It does **not** create a component matrix. `PRODUCT LABEL != AUTOMATIC WARRANTY TERM`.

`HARDWARE_TERM` / `MECHANISMS_TERM` / `UPHOLSTERY_TERM` / `FINISH_TERM` / `THIRD_PARTY_COMPONENT_TERM` = **NOT SEPARATELY CONFIRMED** (not «0 months»).

| Bucket | Commercial term | Source | Current confidence |
| --- | --- | --- | --- |
| STANDARD | Base **12 months** | owner decision 2026-08-19 | Term confirmed; scope wording `LEGAL REVIEW` |
| CONFIGURABLE (preset upholstery/finish/size) | Same 12 months; preset does not change term | owner + product model | Confirmed as method |
| BESPOKE / «По проекту» | Same 12 months; label does not change term | owner + BESPOKE_POSITIONING | Contract-specific exceptions must be separate |
| Furniture structure | Base 12 months; legacy annex was materials/manufacturing defects | owner vs legacy 18m | Legacy scope not auto-ported |
| Hardware / фурнитура | **NOT SEPARATELY CONFIRMED** | oferta **12.2** legacy carve-out | Do not port carve-out; do not say «no warranty» |
| Mechanisms | **NOT SEPARATELY CONFIRMED** | - | - |
| Upholstery / finish | **NOT SEPARATELY CONFIRMED** | dogovor 5.1–5.2 variation language | Care / characteristics, not a second term |
| Third-party components | **NOT SEPARATELY CONFIRMED** | - | - |
| Wall panels | **MISSING** as a separate term. OD-08 OPEN | - | Do not invent panel/install warranty |
| Accessories (covers, pillows, linen) | Legacy 12.2 carve-out | oferta | Not current policy |

---

## Exclusions vs care (legacy; not new-site SoT)

Do not promote these as current policy. Blanket «warranty void» language is **`SUSPECT / LEGAL REVIEW`** (ЗоЗПП ст. 16: terms that cut statutory rights are invalid — `EXTERNAL VERIFICATION`).

| Claim | Source | Type | Status |
| --- | --- | --- | --- |
| Self-assembly / third-party delivery-lift-assembly → no warranty service (except manufacturing defect) | dogovor 5.6 | exclusion | **`SUSPECT / LEGAL REVIEW`**; assembly not confirmed (`OD-02`/`OD-08`) |
| Humidity/temperature outside stated band → «гарантия не распространяется» | oferta wood-care annex | exclusion mixed with care | **`SUSPECT / LEGAL REVIEW`**. Care numbers exist; legal voidance is another question |
| Mechanical damage, DIY repair, altered construction | oferta 12.3 | exclusion | Legacy; statutory defects still `LEGAL REVIEW` |
| Uneven floor → geometry/gaps not covered | oferta manufacturer conditions | exclusion | Legacy technical; `LEGAL REVIEW` if used to refuse defects |
| Commercial use without permission | oferta manufacturer conditions | exclusion | Legacy; B2B vs consumer `LEGAL REVIEW` |
| Keep packaging / labels / assembly instruction / passport / purchase documents | oferta manufacturer conditions | process condition | No proof new stack issues a **talon**. Do not tell buyers «сохраните талон» |
| `/pravila-ekspluatacii/` §5.3–5.4: manufacturer TUs condition **any** warranty; non-compliance **annuls any warranty** | live care page 2026-08-19 | blanket void | **`SUSPECT / LEGAL REVIEW`** |
| Natural grain / shade / upholstery batch mismatch ≠ defect | dogovor 5.1–5.2 | characteristic vs defect | Legacy; do **not** declare every variation «не дефект» without technical/legal basis |
| Light folds on facing material «не считаются дефектами» | oferta annex (cut off in HTML extract) | characteristic | Incomplete extract; still not a current approved list |

Care recommendations (loads, dust, no water, distance from radiators) can later live in a care guide. They are **not** automatically warranty exclusions.

---

## Statutory baseline (`EXTERNAL VERIFICATION`, not `OWNER CONFIRMED`)

Primary: Закон РФ от 07.02.1992 N 2300-1 (ред. от 28.12.2025, с изм. от 17.02.2026).
This cycle: ConsultantPlus **ст. 5** text retrieved; **ст. 19** Consultant fetch timed out — wording corroborated via Garant/Klerk copies of the same article. **ст. 18** Consultant article page did not return the article body (document chrome only). Application to a specific Woodright SKU: **`LEGAL REVIEW`**.

| Rule | Source | Applicability | Mark |
| --- | --- | --- | --- |
| Manufacturer **may** set a warranty period; seller **may** set one if the manufacturer did not; extra (post-warranty) commitments are separate | [ст. 5 п. 6–7](https://www.consultant.ru/document/cons_doc_LAW_305/22c260b788536c4fc7b9a9ea65de44d4aea083dc/) | Whether Woodright is manufacturer vs only seller = `LEGAL REVIEW` | `EXTERNAL VERIFICATION` |
| Service life is a different institute (substantial defects / spare parts) | ст. 5 п. 1–2 | Do not equate to «18 months warranty» | `EXTERNAL VERIFICATION` |
| During an established warranty, consumer may claim ст. 18 remedies for defects found in that period | ст. 19 п. 1 | If a commercial term is confirmed | `EXTERNAL VERIFICATION` |
| If **no** warranty: claims in a reasonable time, **within 2 years** from transfer (unless longer by law/contract) | ст. 19 п. 1 абз. 2 | Directly relevant if OD-04 = C (no published commercial term) | `EXTERNAL VERIFICATION` |
| If warranty **&lt; 2 years** and defect found after it but within 2 years: claims possible if consumer **proves** pre-transfer cause | ст. 19 п. 5; ГК [ст. 477 п. 5](https://www.consultant.ru/document/cons_doc_law_9027/8b7a38b6b8d64dd63196de24c7ab4376b8682765/) | 18 months is &lt; 2 years | `EXTERNAL VERIFICATION` |
| Warranty/service-life clock generally from transfer unless contract says otherwise | ст. 19 п. 2 | Matches legacy «с момента передачи» | `EXTERNAL VERIFICATION` |
| Contract terms that worsen consumer rights vs ZoZPP are invalid | ст. 16 | Blanket void-for-humidity / void-for-DIY | `EXTERNAL VERIFICATION` + `LEGAL REVIEW` on each clause |
| Burden of proof **during** warranty (seller must show consumer/third-party/force-majeure cause) | ст. 18 п. 6 (statute; article HTML not re-fetched this turn) | Do not invert in buyer copy | `EXTERNAL VERIFICATION` / `LEGAL REVIEW` if citing in UI |
| Substantial defects after warranty, within service life or **10 years** if service life unset | ст. 19 п. 6 | Sensitive if anyone treats 18m as service life | `LEGAL REVIEW` |

**Owner does not choose** «соблюдать / не соблюдать» these rules. Owner may confirm a **commercial** term, extra goodwill, and the operational contact.

Live oferta **§14.3** «устранение недостатков … 45 календарных дней» is a published legacy clause; it is **not** an OD-06 SLA and is **not** new-site SoT. Possible overlap with ЗоЗПП ст. 20 repair timing → `LEGAL REVIEW`, not an owner «3 / 10 / 30 days» pick.

---

## Commercial vs statutory (short)

Publishing **no** 18-month number **does not mean** «гарантии нет» in the colloquial sense of «прав при недостатке нет». Statutory defect rights remain. A commercial 18-month term, if confirmed, is an **additional** clock/presumption layer — and because 18 &lt; 24 months, ст. 19 п. 5 still matters after month 18.

`/returns` (OD-03 = B): refuse / return / order problems / defect **journey**.
`/warranty`: commercial term **if** confirmed + what to do on a defect + links.
`/offer`: legal detail.
Do not triplicate.

---

## STANDARD / CONFIGURABLE / BESPOKE

No evidence of three warranty schedules. Historical «По проекту» has **no** separate warranty page in dump. Bespoke is the new name of that direction (`BESPOKE_POSITIONING.md`).

```text
PRODUCT LABEL != AUTOMATIC WARRANTY TERM
BESPOKE LABEL != AUTOMATIC WARRANTY TERM
WOODRIGHT_BESPOKE = NEW NAME + PREMIUM RETHINK OF «По проекту»
SAME_BUSINESS_ENTITY = YES
/bespoke/catalog = NOT DEFAULT IA
```

---

## Documentation buyers receive

| Item | Current evidence |
| --- | --- |
| Warranty talon | **Not found** (no PDF/docx in `docs/`; dump `талон` hits are the city name Талон) |
| Product passport / assembly instruction | Legacy oferta says they are **in the box**; dump has attachment title «Инструкция по сборке». New-stack issue process **`MISSING`** |
| Act of transfer | Dogovor §5.5; not proven as current ops |
| Electronic warranty | **`MISSING`** |

Do not write «сохраните гарантийный талон» on the new site.

---

## Claims process (warranty-specific)

Reuse OD-03. Do not invent email or SLA.

| Step | Status |
| --- | --- |
| Customer contacts Woodright | **PARTIAL** — showroom phones / messengers confirmed; live oferta 14.4 also lists `+7 967 258-71-44` and **Woodright.Grand@yandex.ru** — **not** owner-confirmed claims email (OD-03: claims email `MISSING`; do not adopt this address in the warranty cycle) |
| Order identified | **MISSING** as SOP |
| Issue documented | **MISSING** |
| Photos / inspection | Legacy: keep packaging for specialist visit; **current SOP `MISSING`** |
| Assessment | **MISSING** |
| Repair / replacement / other | Legacy dogovor 5.7 paid service after warranty / excluded cases; **current promise `MISSING`**. Do not promise a free technician visit |
| Geography / cost of repair visit | **`MISSING`** |

**Claims SLA = `OD-06B` (no extra commercial promise).** `OD-06A` remains LEGAL REVIEW (submit ≠ acceptance). Do not add 3 / 5 / 10 / 30 days as Woodright SLA. Statutory clocks stay `EXTERNAL VERIFICATION`.

---

## Rem / canonical new stack

| Tree | Warranty page |
| --- | --- |
| Remediation `woodright-legal-content-remediation-20260804` | `/warranty` stub: «Срок и объём гарантии утверждает владелец…» / no invented number. `warranty_terms` owner field empty |
| Canonical `apps/storefront` | **No** `/warranty` route (grep 2026-08-19) |
| Ops / other worktrees | Older legal pack also fail-closed |

Rem **consciously** refused to port 18 months. That is 2026 new-stack intent, not owner ratification of «no warranty».

---

## Buyer questions

| Question | Status |
| --- | --- |
| Есть ли гарантия? | `ANSWERABLE` — commercial term 12 months (owner-set); statutory rights also exist |
| Сколько действует коммерческий срок? | `ANSWERABLE` — 12 months (`OD-04 = B`) |
| С какого момента? | `LEGAL REVIEW / CONTENT COMPLETION` (legacy: передача - not owner-confirmed) |
| На что распространяется? | `PARTIAL` / `LEGAL REVIEW` — base 12 months; no component matrix |
| На фурнитуру? | `PARTIAL` / `LEGAL REVIEW` — not separately confirmed; not «0 months» |
| На обивку? | `NOT SEPARATELY CONFIRMED` |
| На механизмы? | `NOT SEPARATELY CONFIRMED` |
| На Bespoke / штатную обивку? | `ANSWERABLE` as principle: label ≠ term; base 12 months |
| Что делать при недостатке? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` — contact showroom (`OD-03`) |
| Кто рассматривает? | `PARTIAL` — manager via phones; no named warranty desk |
| Привозить мебель / приедет мастер / кто платит ремонт? | `MISSING` |
| Что гарантийный случай / не случай? | `LEGAL REVIEW` (legacy lists not approved) |
| Сам собрал / сторонние сборщики? | `SUSPECT / LEGAL REVIEW` — do not port dogovor 5.6 |
| После окончания коммерческого срока? | `ANSWERABLE` at law: ст. 19 (2 years / proof shift) — `EXTERNAL VERIFICATION`; not a Woodright SLA |
| Нужен талон? | `ANSWERABLE` for new site: **no current talon found** |
| Какие фото / документы? | `MISSING` ops; law: proof of purchase not only the receipt |

---

## Candidate models (research 2026-08-19 — historical)

Research **C** was the publication recommendation **before** owner set a term. Owner did **not** choose A (confirm 18 months) and did **not** inherit generic dump 12 months.

**A — Confirm 18 months.** Not chosen. `LEGACY_18_MONTHS = REJECT AS NEW-SITE SOT`.

**B (research meaning) — Different *found* current term.** Research: **not available** as an operational find. Dump 12 months = other seller / theme.

**B (owner decision 2026-08-19) — Owner-set 12 months.** **CONFIRMED.** New business rule. Token `OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`. Not the research «found term».

**C — No unverified public commercial term.** Superseded for the **number**. Statutory rights copy remains relevant as a supporting layer.

**D — Warranty matrix.** Still **not available**. No confirmed component/class terms. Do not invent a matrix.

---

## Recorded token

```text
OWNER CONFIRMED
OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET
WOODRIGHT_OD04_WARRANTY_12_MONTHS_OWNER_RATIFIED
```

Does **not**, by itself, approve start wording, exclusions, talon language, manufacturer, or the full legal pack.

---

## COPY candidates (`NOT IMPLEMENTED`)

**After OD-04 = B** (`COPY — OWNER TERM CONFIRMED / LEGAL REVIEW REQUIRED / NOT IMPLEMENTED`):

> Гарантия Woodright - 12 месяцев. Если вы обнаружили недостаток, свяжитесь с нами и назовите номер заказа. Менеджер уточнит детали и подскажет дальнейшие действия.

Do **not** add yet: «с момента передачи»; blanket exclusions; free repair / master visit / replacement; claims SLA; «гарантия производителя»; «на всю мебель без исключений»; component terms.

**Historical C-sense** (still useful as supporting statutory line after legal review):

> Если вы обнаружили недостаток, свяжитесь с Woodright. Права покупателя, предусмотренные законом, сохраняются независимо от того, опубликован ли отдельный коммерческий гарантийный срок.

Do not write «Гарантии нет». Do not use privacy email. Do not use `Woodright.Grand@yandex.ru` as a new-site claims address without a separate owner confirmation.

---

## Proposed `/warranty` IA

Purpose: **объяснить 12-месячный гарантийный срок и что делать при обнаружении недостатка.**

1. Answer-first: 12 months (Woodright).
2. Start **only after** `LEGAL REVIEW / CONTENT COMPLETION`.
3. Scope / exclusions **only after** legal review - no invented matrix.
4. If a defect is found → contact (phones already confirmed).
5. What is needed for a claim — only confirmed items (today: order identity; not talon).
6. Materials / care — only if later proven, as care not as a void list.
7. What is not a warranty case — only after legal review.
8. Link `/returns`.
9. Link `/offer`.

Readiness: **READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW**. Not `READY_FOR_PRODUCTION`. Not a duplicate of `/offer` or `/returns`.

---

## Addendum 2026-08-31 (Word source term aligned; not a new OD)

The 2026 client Word template (CTR-2026, **not in git**) now says **12 months from transfer**. Verified 2026-08-31. Previous wording **18 months** is historical provenance. Live `/oferta/` and `/dogovor-postavki/` 18 months remain `LEGACY PUBLIC DIVERGENCE`.

This **does not** close `WARRANTY_START = LEGAL REVIEW / CONTENT COMPLETION` for website `/warranty` copy, nor obligor / exclusions.

CAS and exact before/after: `docs/owner/contract-template-reconciliation.md`.

---

## Mutations this cycle

buyer-facing: NO · backend: NO · DB: NO · deploy: NO · commit: NO · push: NO · PR: NO
