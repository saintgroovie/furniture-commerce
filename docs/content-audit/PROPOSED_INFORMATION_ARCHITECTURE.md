# Proposed information architecture

Design from buyer intents, not from every legacy URL.

## Principles

1. **Two layers:** human service hubs vs legal documents.
2. **Single source of content truth** for each commercial fact (see below).
3. **Answer-first** on service pages; numbers only if owner-confirmed.
4. **Do not port** live CS-Cart tariffs/warranty/returns blindly.
5. Woodright Bespoke is the premium rethink of «По проекту» - a project/service journey, not a third catalog. Service hubs must not promise unlimited custom.

## Target map

```text
Покупателям
├── Контакты                          [/contacts]
├── Доставка                          [/delivery]   ← quote-only hub; lift/assembly/pickup only if later confirmed
├── Оплата                            [/payment]
├── Возврат и обмен                   [/returns]
├── Гарантия                          [/warranty]
└── (no generic /services; OD-11 closed 2026-08-20)

Юридические документы
├── Оферта                            [/offer]
├── Политика конфиденциальности       [/privacy]
├── Согласие / персональные данные    [/personal-data]
├── Cookies                           [/cookies]
├── Условия пользования сайтом        [/terms]
└── Реквизиты                         [/requisites]

Проект и партнёры
├── Woodright Bespoke                 [/bespoke] + [/bespoke/request]
│                                     (nav compact label: Bespoke; landing: Woodright Bespoke)
├── Дизайнерам                        [/designers]  ← merged; not a Bespoke duplicate
└── Стеновые панели                   capability mention on /bespoke and /designers
                                      no /services; no standalone panels service page
                                      /bespoke/catalog = NOT default IA

Бренд
├── О бренде / Производство / Материалы
```

### Why combine delivery + lift + assembly

Buyers ask one journey: «как приедет и встанет в квартире». One hub with H2 sections + FAQ accordion beats three thin pages **until** content volume grows. Split later if assembly policy becomes long.

### Why keep returns ≠ warranty

Different legal regimes and buyer mental models; cross-link heavily.

### Why merge designers pages

Current three pages share one CTA and no distinct facts. One page with sections Materials / How we work / Request.

## Per-page briefs

### `/contacts` — READY for polish copy

- **Answers:** where, phones, messengers, map, how to visit
- **Owns:** showroom SoT
- **Not:** tariffs, legal entity dump
- **UX:** answer-first address + phones; messengers; map CTA; short visit note
- **CTA:** call / messenger / (optional) request visit
- **Source readiness:** READY (hours/emails blocked until OD)

### `/delivery` - READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS (`OD-02 = B`)

- **Answers now:** how cost is set (quote-only); when terms are agreed (after order, before payment)
- **Owns:** DELIVERY commercial model (`DEL-008`)
- **Not yet:** geography, lift, assembly, pickup, dates
- **Must not:** publish ₽/%; «доставка бесплатно» from checkout `0 ₽`; invent Moscow/MKAD/RF
- **UX:** 1) short hero (canonical COPY) 2) how it fits payment (`OD-05`) 3) later sections only if owner confirms 4) FAQ
- **CTA:** оформить заказ / контакты
- **Readiness:** pricing journey **READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS**. Prefer one `/delivery` hub (not `/services`). **OD-11 closed 2026-08-20:** `OD11_NO_GENERIC_SERVICES_HUB`.

### `/payment` — READY_FOR_COPY_PHASE

- **Answers:** when to pay (not on checkout); PaymentLink or invoice after manager review
- **Owns:** PAYMENT facts (`OD-05 = A`)
- **Must not:** acquiring, QR, installment, public bank block (`OD-10 = B`), PSP names, send SLA
- **UX:** answer-first: оплачивать сразу на сайте не нужно → менеджер отправит ссылку или счёт
- **Readiness:** payment facts **READY_FOR_COPY_PHASE**. Route may still be absent in this tree. Offer acceptance (`OD-06`) is a separate legal dependency - do not invent it on this page.

### `/returns` - spec ready 2026-09-01 (`OD-03 = B`; not production)

- **SoT:** `docs/owner/returns-sop.md` (+ `OD03_RETURNS_VERIFICATION.md`)
- **Answers now:** contact Woodright; manager handles the case; mandatory consumer rights not waived; remote 26.1 / defect 18–24 / individually-determined two-limb test; 14 days / Demo Magazin are **not** new-site SoT; Bespoke label is **not** automatic no-return
- **Must not:** Demo Magazin; inherit 14; blanket «под заказ невозвратно»; duplicate `/warranty`; invent SLA (`OD-06B`); invent extra goodwill / auto-refund; write as if manager *sets* statutory deadlines
- **UX:** intro → отказаться от заказа/товара → недостаток → повреждение при доставке → некомплект → индивидуальные изделия (criterion, not a ban) → как обратиться → что дальше (SOP steps) → ссылка на оферту
- **Readiness:** SOP verified. Not `READY_FOR_PRODUCTION`. Reverse-logistics arranger / claims email still incomplete
- **Contact:** showroom phones (claims email `MISSING`; TG/WA not formal claims channel without legal review)

### `/warranty` - spec ready 2026-09-01 (`OD-04 = B`; not production)

- **SoT:** `docs/owner/warranty-public-policy.md` (+ `OD04_WARRANTY_VERIFICATION.md`)
- **Buyer purpose:** explain the **12-month** commercial warranty term and what to do if a defect is found
- **Answers now:** commercial term = 12 months; start from transfer; seller ООО «Роэл-Техник»; statutory defect rights preserved. Contact = showroom phones (`OD-03`)
- **Must not:** inherit live 18 months; treat generic dump 12 months as source; «гарантии нет»; «гарантия производителя»; Demo-style talon; assembly as total void; SLA (`OD-06B`); privacy email; Bespoke-specific term from the label; duplicate `/returns` or `/offer`; invented component matrix
- **UX:** answer-first 12 months → start from transfer → manufacturing-defect scope → if defect found → what is needed → care → narrow exclusions → links to `/returns` and `/offer`
- **Readiness:** spec verified. Not `READY_FOR_PRODUCTION`
- **Contact:** showroom phones (claims email `MISSING`)

### Legal docs — entity identity READY for later `/requisites`; PD/offer still BLOCKED

- Seller identity confirmed (`OD-01 = A`): ООО «Роэл-Техник» + OGRN/INN/KPP/legal address.
- Bank account / BIK: **do not put on `/requisites`** (`OD-10 = B`).
- Privacy email still missing as a dedicated field; PD operator identity is OD-01. Offer **submit ≠ acceptance** is `OD-06A` (implementation + legal review), not a mixed owner-open P0. Exact acceptance moment remains `LEGAL REVIEW`.
- Buyer explanation pages must **link** here, not duplicate contract prose.
- `/requisites` may publish identity only (`OD-10 = B`). Bank block forbidden. Full pack token still not issued.

### `/bespoke` — READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS

- **SoT:** `docs/content-audit/BESPOKE_POSITIONING.md`
- **Model:** Woodright Bespoke = new name + premium rethink of «По проекту» (same entity). Not a parallel service. Not a third catalog
- **Answers now:** if the catalog/presets cannot do the job, Woodright can design and make it; 20+ years; private + institutional **projects** (not partnership); process without SLA
- **Must not:** 30%; gift sketch; restoration menu; «под ключ»; invent min price / install / measurement; teach STANDARD/CONFIGURABLE/BESPOKE as a buyer taxonomy
- **UX:** hero → когда нужен Bespoke → простая граница с каталогом (3 смысла, не матрица) → capabilities → 4 selected cases → process → designers link → short request
- **Default IA:** `/bespoke` + `/bespoke/request` only. `/bespoke/catalog` = **not recommended**
- **OD-11** closed 2026-08-20: `OD11_NO_GENERIC_SERVICES_HUB`. No `/services`. No standalone panels route.

### `/designers` — READY for structural merge + COPY

- How Woodright works with a designer / architect as a professional partner
- Not a duplicate of the Bespoke product story
- No fake commercial terms (`OD-09` = soft cooperation, 2026-08-20)
- CTA may share `/bespoke/request` with audience flag

### Panels page — not a launch route

No standalone panels service page (`OD-08` / `OD-11` 2026-08-20). Mention only as a capability on `/bespoke` and `/designers`, without install/measurement promises.

## Progressive disclosure patterns

| Page | Pattern |
| --- | --- |
| Contacts | answer-first + contact block |
| Delivery | short intro → matrix/table → accordion exceptions → CTA |
| Payment | answer-first → numbered process → statuses |
| Returns/Warranty | contact → key rule → accordion → legal link |
| Offer/Privacy | legal document layout + version footer |
| Bespoke | numbered process + CTA (not price table) |
| Designers | short intro + two sections + CTA |

## Cross-page consistency — single sources

| Fact | Primary home | Elsewhere |
| --- | --- | --- |
| Phones/address/messengers | `showroom-contacts.ts` → `/contacts` | Short embed only |
| Delivery commercial model (quote-only) | `/delivery` | Checkout: manager agrees delivery before payment. Lift/assembly/pickup only if later confirmed |
| Payment methods | `/payment` | `paymentClarity` short on checkout |
| Returns | `/returns` | Offer cross-link only |
| Warranty | `/warranty` | Offer cross-link; PDP one line later if needed |
| Seller identity | `/requisites` + `/offer` (name/INN/OGRN/address; **no bank**) | Privacy operator block when PD copy exists |
| Bespoke process | `/bespoke` | Designers points here |
| Cookies tech | `/cookies` | Privacy short link |

## CTA logic (not pixels)

| Intent | CTA label | Destination |
| --- | --- | --- |
| Visit / call | Call / messengers | `/contacts` or tel/wa |
| Serial help | Получить консультацию | `/contacts` |
| Preset options of a catalog model | choose on PDP | cart (CONFIGURABLE) |
| Beyond presets / no catalog match | Обсудить задачу | `/bespoke/request` |
| Designer partnership | Обсудить проект | `/bespoke/request?from=designers` (or tagged) |
| After order logistics | (no fake «вызвать замерщика») | Manager contact post-order |
| Legal accept | Links in form | `/privacy` `/personal-data` `/offer` when approved |

Avoid CTAs that invent processes: «Вызвать замерщика», «Рассчитать доставку онлайн» - until backend+OD exist.
