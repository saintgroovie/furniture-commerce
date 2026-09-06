# Content inventory — buyer-facing informational system

## 1. New storefront (remediation worktree = richest)

| Current page | Route | Source | Buyer intent | Fact quality | Problems | Proposed role |
| --- | --- | --- | --- | --- | --- | --- |
| Доставка | `/delivery` | LEGAL-CONTENT + OD-02 = B | Как привезут / самовывоз? | **Owner-confirmed** quote-only journey; geography/lift/assembly `MISSING`/`PARTIAL` | No public tariff; do not promise extra services | Delivery hub; READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS |
| Оплата | `/payment` | LEGAL-CONTENT / checkoutCopy | Как платить? | **Owner-confirmed** PaymentLink/invoice | Page may be missing in this tree; copy phase allowed | Payment hub |
| Возврат | `/returns` | LEGAL-CONTENT + OD-03 = B | Можно вернуть? | Launch model **owner-confirmed**; SOP verified 2026-09-01 (`docs/owner/returns-sop.md`) | Storefront not shipped; Demo Magazin live only | Hub; spec ready, not production |
| Гарантия | `/warranty` | LEGAL-CONTENT + OD-04 = B | Что если недостаток / какой срок? | **Owner-confirmed** 12 months + spec 2026-09-01 (`docs/owner/warranty-public-policy.md`) | Rem stub; live 18m = legacy divergence | Hub; spec ready, not production |
| Оферта | `/offer` | LEGAL-CONTENT | Юр. условия продажи | Skeleton | Acceptance TBD; **seller identity now confirmed** (not wired into page yet) | Legal document |
| Политика ПДн | `/privacy` | LEGAL-CONTENT | Что с данными? | Partial skeleton | Operator copy + privacy email still MISSING | Legal document |
| Персональные данные | `/personal-data` | LEGAL-CONTENT | На что соглашаюсь в форме? | Partial | - | Consent companion |
| Cookies | `/cookies` | LEGAL-CONTENT | Какие cookies? | Strong-ish (cart_id coded) | - | Legal short page |
| Условия пользования | `/terms` | LEGAL-CONTENT | Правила сайта | Site-use only | Not purchase terms | Site rules |
| Реквизиты | `/requisites` | LEGAL-CONTENT | Кто продавец? | Identity SoT ready; page not published | Entity **CONFIRMED**; bank **not public** (`OD-10 = B`). Do not treat empty bank block as a bug | Legal identity |
| Контакты | `/contacts` | SHOW-REM + contactsCopy | Как связаться / приехать? | **Strong** | Hours not in SoT | Contacts hub |
| Дизайнерам (лендинг) | `/designers` | designersLandingCopy | Работаете с дизайнерами? | Marketing thin | No commercial terms | Trade entry |
| Условия сотрудничества | `/designers/terms` | designersTermsCopy | Какие условия? | **Mismatch title vs body** | No discounts/SLA | Merge or rename |
| Материалы | `/designers/materials` | designersMaterialsCopy | Есть образцы? | Weak promise | No logistics | Samples subsection |
| Заявка дизайнера | `/designers/request` | page → bespoke form | Как подать заявку? | Process only | Same funnel as Bespoke | CTA alias |
| По проекту / Bespoke | `/bespoke` | bespokeLanding + `BESPOKE_POSITIONING.md` | Нет решения в каталоге? | Proof **owner-confirmed**; live copy weaker | Live still «По проекту» / «под ключ»; Bespoke = rethink of that direction, not a second service | Hub; READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS |
| Направления | `/bespoke/catalog` | bespokeCatalogCopy | Что делаете на заказ? | Marketing | Broad «по вашим размерам»; looks like a third catalog | **Not default IA** - keep as existing route until copy phase; do not recommend |
| Заявка | `/bespoke/request` | form + copy | Оставить расчёт | Strong process | Not service FAQ | Lead form |
| О бренде | `/about` | aboutCopy | Кто вы? | Brand | - | Brand |
| Производство | `/about/production` | aboutProductionCopy | Как делаете? | Brand | «сборка» = factory | Brand |
| Материалы | `/about/materials` | aboutMaterialsCopy | Из чего? | Brand | - | Brand |

### Canonical main tree delta

Footer still links Privacy / Условия / Доставка / Оплата / Возврат, but **routes missing** → 404 on `:3002`.
Remediation footer lists full legal set while status remains `owner_review`.

## 2. Live public CS-Cart (still online)

| Page | URL | Fact quality if treated as SoT | Real status |
| --- | --- | --- | --- |
| Доставка и сборка | `/dostavka-i-sborka/` | Numbers present | `STALE` / conflict with dogovor |
| Оплата и рассрочка | `/oplata-i-dostavka/` | Methods claimed | `LEGACY DIVERGENCE` / `NOT NEW-SITE SOT` (`OD-05 = A`) |
| Возврат | `/vozvrat/` | 14 days + **demo pollution** (`Демо Магазин` / `demostore.ru` still HTTP 200 on **2026-08-17**) | `STALE` + `LEGACY PUBLIC DEFECT`; `REJECT AS NEW-SITE SOT` |
| Оферта | `/oferta/` | Full contract + entity + bank | `STALE` until owner re-approves |
| Контакты | `/kontakty/` | 404 | Broken IA |
| Дизайнерам (nav) | `/dileram-i-dizayneram` | Unknown | Likely thin/empty |

## 3. Duplicate / overlapping materials

| Topic | Places | Action |
| --- | --- | --- |
| Delivery | public CS-Cart, LEG-SQL RU ₽ page vs dogovor/EN 1%, rem `/delivery`, checkout 0 ₽ (`DEL-007`), owner OD-02 = B | Single hub; quote-only COPY; do not port ₽ |
| Payment | public, rem `/payment`, checkout `paymentClarity`, offer | Hub + checkout short |
| Returns | public polluted, rem stub, offer refs | Hub after SOP: `docs/owner/returns-sop.md` (2026-09-01). Storefront not shipped |
| Warranty | owner-set 12 months (`OD-04 = B`); spec 2026-09-01 `docs/owner/warranty-public-policy.md`; live `/oferta/` 18m = `LEGACY PUBLIC DIVERGENCE`; rem stub | Hub spec ready, not production; do not port 18m |
| Contacts | showroom SoT, public footer (hours/emails extra), legal pages embed showroom | Showroom SoT primary |
| Designers vs Bespoke | three designer pages + bespoke request | Keep separate pages: Bespoke = what Woodright can make; Designers = how professionals work with Woodright. Shared request form OK; do not duplicate story |

## 4. Keep / merge / split / remove (recommendation)

| Material | Verdict |
| --- | --- |
| `/contacts` | **Keep** independent |
| `/delivery` (+ assembly/lift as sections) | **Keep** hub; do not split until content volume proves need |
| `/payment` | **Keep** short independent |
| `/returns` + `/warranty` | **Keep** separate (different legal regimes) OR combine as «После покупки» with two H2 - prefer separate for scan |
| `/offer` `/privacy` `/personal-data` `/cookies` `/requisites` `/terms` | **Keep** as legal layer (not marketing FAQ) |
| `/designers/terms` + landing | **Merge** into one «Дизайнерам» page; materials as section |
| `/designers/request` | **Remove as page** → CTA to shared request with `audience=designer` |
| `/bespoke/catalog` | **Not default IA** - do not treat as a Bespoke product shop; existing route may remain until copy phase |
| Public CS-Cart service pages | **Retire at cutover**; do not port numbers blindly |
| «Правила эксплуатации» | **Optional** FAQ/PDF later - not blocking |
| «Гарантия низкой цены» (disabled legacy) | **Do not revive** |
| Wall panels standalone info page | **Create** only after owner confirms service model (see IA) |
