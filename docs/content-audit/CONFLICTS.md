# Conflicts

Only **incompatible** conditions. Editorial paraphrases excluded.

**Current remaining-OD status (2026-08-20):** `docs/content-audit/20260820_LAUNCH_COMPLETION.md`. This file remains the historical conflict log.

---

## CF-01 — Delivery price (Moscow / МО)

**Topic:** Delivery tariff

**RESOLVED BY OWNER FOR NEW SITE — 2026-08-17** (`OD-02 = B`)

**Source A:** Live `https://woodright.ru/dostavka-i-sborka/` + LEG page 26
**Claims:** Moscow **2000 ₽**; МО **1000 ₽ + 50 ₽/km** from MKAD; other RF cities via carrier at buyer cost.
**Status of A:** `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT`. Not a launch default.

**Source B:** LEG `/dogovor-postavki` page 25
**Claims:** Delivery in seller presence cities (Moscow region, Ivanovo) = **1% of contract**.
**Status of B:** `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT`. `1%` is **delivery**, not assembly.

**Source C:** Rem `/delivery`
**Claims:** No tariffs; manager confirms after order composition.

**New-site SoT:** neither A nor B. Owner chose **quote-only** (`OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`). Keep this row for provenance (live CS-Cart may still show ₽/% until cutover).

**Not resolved here:** geography, lift availability, assembly availability, pickup (`OD-07` / `OD-08`).

**2026-08-15 verification (historical):** no current tariff SoT in repo/Excel; checkout is 0 ₽ manager quote (`DEL-007`; technical / non-commercial). See `OD02_DELIVERY_SERVICES_VERIFICATION.md`.

---

## CF-02 — Payment methods (public vs new stack)

**Topic:** How buyers pay

**RESOLVED BY OWNER FOR NEW SITE — 2026-08-15** (`OD-05 = A`)

**Source A:** Live `/oplata-i-dostavka/` — bank transfer, QR, card in salons/IM, Sberbank partner, own installment during production.
**Status of A:** `LEGACY DIVERGENCE` / `NOT NEW-SITE SOT`. Do not port without a new OD **and** implementation.

**Source B:** Canonical checkout + PaymentLink — no on-site card; manager invoice / PaymentLink after confirmation.

**New-site SoT:** Source B, owner-confirmed. Keep this conflict row for provenance (live CS-Cart still diverges until cutover).

---

## CF-03 — Warranty term

**Topic:** Commercial warranty duration / obligor / hardware scope

**Source A:** Live `/oferta/` annex (2026-08-19) + dump: manufacturer **18 months from transfer** (materials / manufacturing defects). Same live `/dogovor-postavki/` §5.4: **seller** 18 months from transfer on all furniture. PDP badge 18 months.

**Source B:** Rem `/warranty` (2026-08-04) — no number at research; owner must approve. Canonical storefront has no `/warranty` route.

**Source C (not current competing Woodright policy):** dump EN oferta/dogovor **12 months** under **ИП Елисеев**; CS-Cart theme «Гарантия 12 месяцев» (generic, with 14-day return tooltip). `STALE / GENERIC TEMPLATE`. **Not** the source of OD-04 = B.

**Resolvable?** Commercial **term** conflict **RESOLVED BY OWNER — OD-04 = B** (2026-08-19): owner set a **new** launch commercial warranty term of **12 months**. This is a new business rule, **not** a choice of one legacy source. Legacy 18 months and generic legacy 12 months are **not** current SoT. Live CS-Cart 18 months, if still printed = `LEGACY PUBLIC DIVERGENCE` (not unpublished in this cycle).

**Owner decision:** **OD-04 = B CONFIRMED** (`OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`). Pack: `docs/content-audit/OD04_WARRANTY_VERIFICATION.md`. `PRODUCT LABEL != AUTOMATIC WARRANTY TERM`. Statutory defect rights preserved (`EXTERNAL VERIFICATION`). Board no longer offers «pick live 18 vs rem empty» as the launch number.

**Still unresolved (not a second OD number):** start wording; manufacturer / warranty obligor; component scope (hardware / mechanisms / upholstery / third-party); exclusions (`SUSPECT / LEGAL REVIEW`); claims SOP.

**Addendum 2026-08-28 (historical; superseded for current Word term by 2026-08-31):** at that date the 2026 client supply-contract template still stated seller warranty **18 months from transfer**. That addendum must not be read as the current template term.

**Addendum 2026-08-31:** the operator Word template was physically updated and verified: **12 (Двенадцать) месяцев с момента передачи Товара**. Template vs website term is **aligned**. Historical CTR-2026 wording remains **18 months**. Live CS-Cart 18 months remains `LEGACY PUBLIC DIVERGENCE`. Postal `153025` vs `153000` still `POSTAL_INDEX_RECONCILIATION_REQUIRED`. Record: `docs/owner/contract-template-reconciliation.md`.

---

## CF-04 — Returns window + return logistics

**Topic:** Returns

**Source A:** Live `/vozvrat/` (HTTP 200, **2026-08-17 still live**) - **14 calendar days**; **ООО «Демо Магазин»**; **sales@demostore.ru**; cites repealed ПП РФ 19.01.1998 № 55. Same HTML in dump Jun 2025. Also dump theme «30 дней» and oferta §13 **7 days**.

**Source B:** Rem `/returns` - no window; owner must approve; contact showroom. Canonical: footer `/returns`, **no route**. Woodright approved policy **NOT FOUND**; combined SoT **`PARTIAL`**.

**Likely explanation:** CS-Cart generic template (ст. 25 «14 дней» retail exchange language) left on live site; not a 2026 Woodright SoT.

**Resolvable?** Commercial/legacy-window conflict **RESOLVED BY OWNER — OD-03 = B** (2026-08-19): legacy 14/7/30 do **not** become new-site SoT; launch flow = applicable legal baseline + manager-assisted case handling. Product-to-legal mapping and reverse logistics remain **open** (`LEGAL REVIEW` / `MISSING`). Demo Magazin must never be new-site copy (`LEGACY PUBLIC DEFECT`). Do not port 14.

**Owner decision:** **OD-03 = B CONFIRMED** (`OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE`). Pack: `docs/content-audit/OD03_RETURNS_VERIFICATION.md`. `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`. Board no longer offers «pick 14 vs 7 vs 30» as a business choice.

**Immediate risk:** Live public page is actively harmful (wrong legal entity for returns). This cycle did **not** unpublish it.

---

## CF-05 — Showroom hours / visit rules

**Topic:** Contacts

**Source A:** Public footer — `Пн-Вс: 10.00 - 21.00`

**Source B:** Rem/canon copy — «по договорённости» / delivery page «по записи»; hours **not** in `showroom-contacts.ts`

**Likely explanation:** Mall hours vs appointment-only Woodright practice, or stale footer.

**Resolvable?** NO

**Owner decision:** Publish fixed hours, appointment-only, or both?

---

## CF-06 — Legal entity for buyer contracts

**Topic:** Seller identity

**RESOLVED BY OWNER — 2026-08-15** (`OD-01 = A`)

**Source A:** Live oferta + LEG — ООО «Роэл-Техник» + INN/OGRN (+ bank). External registries: entity exists.

**Source B (historical):** OWN-REV 2026-08-04 — identity fields **MISSING**.

**Owner card 2026-08-15:** same legal entity confirmed as seller for the **new** site. Status: `FACT — CURRENT OWNER CONFIRMED`.

**Still open (not this conflict):** privacy email / PD copy; full legal pack approval; `OD-10` bank visibility (resolved separately as B).

**Residual:** live CS-Cart bank block vs new-site `PUBLIC_BANK_DETAILS = NO` is **legacy divergence**, not an unresolved seller-identity question. See LEG-002 vs LEG-003.

---

## CF-07 — Assembly promise strength

**Topic:** Assembly

**Source A:** Legacy/public — priced service **3%**.

**Source B:** Checkout/cart copy — «свяжемся по доставке и сборке» (implies available, not priced).

**Source C:** Rem delivery — lift/assembly confirmed by manager; no %.

**Likely explanation:** Soft operational mention vs hard legacy price list.

**3% tariff:** `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT` (OD-02 = B did not adopt it).

**Service availability:** still **UNRESOLVED**. OD-02 = B does **not** confirm that assembly is offered. Checkout «обсудить сборку» remains `PARTIAL`. OD-08 for install/panels/«под ключ».

---

## CF-08 — Footer legal links vs route availability (engineering/content)

**Topic:** IA integrity

**Source A:** Canon LaunchAgent `:3002` footer links to `/delivery` etc. → **404**

**Source B:** Rem worktree has pages but `owner_review`

**Source C:** Comment in rem footer says links ship after owner inputs; links already listed

**Not a tariff conflict** — still buyer-breaking. Fix is merge/cutover engineering + honesty about status.
