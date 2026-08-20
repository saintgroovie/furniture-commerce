# Woodright Content Audit — Night Cycle

Date: 2026-08-12 (Europe/Moscow)
Mode: read-only (+ local `docs/content-audit/` only)

**Addendum 2026-08-19 (OD-04 = B ratification):** owner set launch commercial warranty term = **12 months** (`OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`). Provenance = explicit owner decision, **not** generic dump 12 months and **not** live 18 months. Research addendum below stays historical (`NOT FOUND` before this decision). `/warranty` READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW. Start/obligor/exclusions still `LEGAL REVIEW`. Full legal pack is **still not approved**.

**Addendum 2026-08-19 (OD-04 research, not ratification):** approved commercial warranty SoT **`NOT FOUND`**. Live `/oferta/` re-probed HTTP 200: manufacturer **18 months from transfer**; `/dogovor-postavki/` seller **18 months**. Rem `/warranty` still empty. 12 months in dump = ИП Елисеев / CS-Cart theme. Recommended publication **C**. Pack: `OD04_WARRANTY_VERIFICATION.md`. OD-04 remains unanswered. Full legal pack is **still not approved**.

**Addendum 2026-08-19:** `OD-03 = B` (`OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE`) recorded. Launch returns model = manager-assisted; mandatory consumer rights preserved. Legacy 14 days / Demo Magazin remain invalid for the new site (historical evidence below unchanged). Full legal pack is **still not approved**. `OD-04` / `OD-06` remain OPEN.

**Addendum 2026-08-17 (OD-03 research, not ratification):** current return policy SoT **NOT FOUND**. Live `/vozvrat/` re-probed HTTP 200: still **14 календарных дней** + **ООО «Демо Магазин»** + **sales@demostore.ru**. Verdict: `GENERIC TEMPLATE` / `REJECT AS NEW-SITE SOT` / `LEGACY PUBLIC DEFECT`. Do not rewrite the 2026-08-12 findings below as if Demo Magazin never existed. Pack: `OD03_RETURNS_VERIFICATION.md`. OD-03 remains unanswered. Full legal pack is **still not approved**.

**Addendum 2026-08-17:** `OD-02 = B` (`OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`) recorded. Delivery commercial model is quote-only. Legacy 2000 / 1000+50 / 3% / 1% remain `LEGACY DIVERGENCE` / `NOT NEW-SITE SOT`. Geography / lift / assembly / pickup still unconfirmed. Full legal pack is **still not approved**.

**Addendum 2026-08-15:** `OD-01 = A`, `OD-05 = A` (`OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK`), `OD-10 = B` are recorded in `OWNER_DECISIONS.md`. The 2026-08-12 narrative below is historical. Full legal pack is **still not approved**. `OD-06` remains unanswered.

## Human summary

- Источников: storefront canon + **legal remediation tree** (2026-08-04) + ops worktree + live woodright.ru (re-verified) + legacy SQL dump (Jun 2025) + owner packets (2026-07-30, 2026-08-04) + external entity check.
- Информационных поверхностей new site: soft brand/contacts/designers/bespoke на canon; **10 legal routes** в remediation (`owner_review`, identity MISSING); на canon/LaunchAgent `:3002` legal URL из футера → **404**.
- Meaningful facts: см. `FACT_LEDGER.md` (~30+ строк).
- Конфликтов: см. `CONFLICTS.md` (тарифы 2000₽ vs 1%; оплата live vs PaymentLink; гарантия 18 мес vs empty rem; возврат 14 дней + Demo Magazin; часы; юрлицо publish vs MISSING).
- Stale/suspect: live тарифы, рассрочка/эквайринг claims, Demo Magazin returns, bank details on oferta without new-site approval.
- Owner decisions: **компактная доска** в `OWNER_DECISIONS.md` (P0–P2).
- Ready for copy: contacts (после confirm часов), soft payment/checkout honesty, designers soft, about, bespoke UX (без boundary inflation).
- Blocked: delivery numbers, returns window, warranty term, full offer/privacy/requisites, panels service, designer trade programme.

## Task status

`done_with_owner_decisions`

## Source coverage

| Area | Result |
|------|--------|
| Storefront canon | Yes |
| Remediation legal SoT | Yes (primary for new legal IA) |
| Ops WT legal | Yes (secondary / older) |
| Backend | Checkout shipping option name only |
| Docs / owner packets | Yes - **answers still missing** |
| Legacy SQL + scrape | Yes - page bodies in SQL; scrape mostly labels |
| Live public | Yes - re-verified 2026-08-12 |
| External | ООО «РОЭЛ-ТЕХНИК» existence (INN/OGRN); not publish auth |

## Strongest findings

1. **Remediation branch already built honest fail-closed legal IA** (10 pages) in `owner_review`, но **Section A identity = MISSING** - launch blocked by design.
2. **Canon footer links to `/privacy` `/terms` `/delivery` `/payment` `/returns` without routes** → buyer 404 on that tree / `:3002`.
3. **Live `/dostavka-i-sborka/`:** Москва **2000 ₽**; МО **1000 ₽ + 50 ₽/км от МКАД**; занос 0,5%/50 м; подъём **0,7% / 0,5% / 1,5%**; сборка **3%**.
4. **Live `/dogovor-postavki/`:** доставка в городах присутствия = **1%** - **конфликт** с п.3; продавец **ООО «Роэл-Техник»**; гарантия **18 месяцев**.
5. **Live `/oferta/` + privacy:** ООО «Роэл-Техник» (ИНН 3702111074, ОГРН 1153702012848) - entity **exists** externally; owner packet всё равно требует confirm для *нового* сайта.
6. **Live `/vozvrat/`:** 14 дней + инструкции слать в **ООО «Демо Магазин» / demostore.ru`** - токсичная публикация.
7. **Live `/oplata-i-dostavka/`:** карта/QR/Сбер/рассрочка vs new stack **PaymentLink / no on-site card**.
8. **Контакты:** showroom SoT Химки + phones совпадают с частью live; одновременно chrome **Марксистская** / hours **10–21** vs «по договорённости».
9. **Стеновые панели** - маркетинг без сервисной страницы/замера/монтажа.
10. **Дизайнерам** - soft pages без скидок (правильно); trade programme = OD.
11. **Bespoke boundary:** footer «Проекты любой сложности» + soft «подберём» размывают модель.
12. Owner packets **2026-07-30 и 2026-08-04** до сих пор **без ответов** в репо.

## Confirmed facts (operational)

- Шоурум: Химки, Бутаково 4, МТК «Гранд-2», вход 3, 4 этаж; +7 800 555-17-36; +7 967 258-71-44; TG/WA (MAX URL в rem).
- New checkout: не платить на сайте сейчас; менеджер подтвердит и пришлёт ссылку.
- BESPOKE не в корзину.
- Rem delivery default: без выдуманных тарифов; менеджер подтверждает.

## Conflicts

См. `CONFLICTS.md`. Главные: delivery 2000/МО vs 1%; payment methods; warranty 18m vs rem empty; returns Demo Magazin; hours; entity publish authorization.

## Stale / suspect

Live %- и ₽-тарифы; installment/acquiring claims; bank line on oferta without new approval; Demo Magazin returns; Марксистская header; any Eliseev/Figaro scrapes from bad HTML extracts (live re-verify = Роэл-Техник).

## Missing buyer answers

Актуальная схема доставки; замер; монтаж панелей; публичные сроки производства; B2B; точный PSP; human returns/warranty для new site; designer commercial terms; единый published seller для new stack.

## Proposed information architecture

См. `PROPOSED_INFORMATION_ARCHITECTURE.md` + `05_PROPOSED_IA.md` (согласованы по духу).
Hub: delivery+assembly; payment; returns(+warranty); terms human; privacy/offer/requisites legal; contacts; designers one hub; panels after OD.

## Owner decisions

См. **`OWNER_DECISIONS.md`** (канон доски).
P0: seller identity · delivery commercial model · returns · payment mode · contacts hours.
P1: warranty · panels · designers · bespoke boundary copy.
Уже существует packet `docs/owner/legal-content-owner-review.md` в remediation - **тот же блокер**, не новый.

## Legal review queue

1. Confirm/replace ООО «Роэл-Техник» + реквизиты для new site
2. Unpublish/replace live `/vozvrat/` Demo Magazin
3. Reconcile oferta vs dogovor delivery math + warranty
4. Returns cite: не опираться на отменённый ПП 55; актуальный перечень - ПП 2463 (EXTERNAL)
5. Этот audit ≠ юрзаключение

## Pages ready for copy phase

Contacts (после OD hours), checkout/payment soft honesty, designers soft, about*, bespoke* (editorial boundary only).

## Pages blocked

Delivery numbers, returns policy, warranty term, offer/privacy/requisites full text, panels hub, designer discounts.

## Out of scope observations

- Live Demo Magazin / broken legacy nav - ops unpublish on CS-Cart
- Three diverging storefront trees (canon / rem / ops) - eng merge separately
- Catalog/SKU/media/pricing - не в scope

## Files created

`docs/content-audit/*` (see README). Prefer unnumbered set listed there.

## Mutations

- buyer-facing: **NO**
- backend: **NO**
- deploy: **NO**
- commit: **NO**
- push: **NO**
- PR: **NO**

## Git status

Audit files local under canonical `docs/content-audit/`. Commit/push not performed.

## Codex CLI reviewer

- Codex reviewer status: **not run**
- Codex commit gate: **n/a** (research only)

## Что осталось

1. Owner: `OWNER_DECISIONS.md` / remediation `legal-content-owner-review.md` (P0).
2. Не переносить live тарифы и Demo Magazin в new site.
3. После P0 - copy phase только для READY; blocked не маскировать копирайтом.
