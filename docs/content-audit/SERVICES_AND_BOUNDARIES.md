# Services matrix, panels, designers, Bespoke boundary

**Supersession 2026-08-20:** OD-07/08/09/11 launch closures are in `docs/content-audit/20260820_LAUNCH_COMPLETION.md`. Matrix rows that still say OD-08 OPEN describe evidence as of the audit, not current launch-blocking status. Unconfirmed services stay unpublished.

## Service matrix

| Service | Exists? | Evidence | Audience | Geography | Paid? | Timing | Dependencies | Exclusions | Owner decision | Public page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Consultation | Weak | CTA → contacts | B2C/B2B | Showroom/phone | Unknown | On request | - | - | SLA? | `/contacts` |
| Selection / quote | Yes (process) | Bespoke + designers copy + forms | All | RU remote | Quote | After request | Form | - | SLA | `/bespoke/request` |
| Showroom visit / try-on | Yes provisional | DEL-001; CON-* | B2C | Khimki | Unknown | Appointment? | - | Hours CF-05 | Hours model | `/contacts` |
| Pickup | Provisional rem only | DEL-001; no checkout method | B2C | Khimki showroom | Unknown | Appointment? | Hours CF-05 | Unknown SKU limits | **OD-07** (not OD-02) | `/delivery` if later confirmed |
| Delivery | **Yes as process**; quote-only | DEL-008 owner + DEL-007 plumbing | B2C | Unspecified (`MISSING`) | Quote after order; checkout 0 ₽ is **not** free | After manager confirm, before pay (`OD-05`) | Order | TBD | **OD-02 = B** (pricing closed) | `/delivery` READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS |
| Lift / carry-in | Current policy `MISSING` | Legacy % = `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT` | B2C | TBD | TBD | TBD | Access | Door width legacy only | **UNRESOLVED** (not implied by OD-02) | `/delivery` section only if owner says it exists |
| Assembly at home | Conversation in checkout; offer/price `UNRESOLVED` | ASM-002; ASM-001 rejected as tariff | B2C | TBD | TBD | After delivery | - | Carrier DIY in legacy | **UNRESOLVED**; panels/Bespoke → OD-08 | `/delivery` or later `/services` |
| Measurement visit | **Unproven** | AI alt only | ? | ? | ? | ? | ? | ? | **OD** | do not claim |
| Design / engineering | Soft | Bespoke/designers | Project | Remote | Quote | Pre-production | Brief | - | Scope | Bespoke |
| Wall panel install | **Unproven** | Footer bullet only | ? | ? | ? | ? | ? | ? | **OD** | panels section |
| Material samples | Weak promise | designers materials | Designers | ? | ? | ? | Request | - | Process | designers |
| Serial size change | CTA only | productCta configureBespoke | B2C | - | Quote if not a preset | - | Classification | Preset size = CONFIGURABLE | Boundary: size change ≠ auto Bespoke | PDP + Bespoke |
| Bespoke / project | Yes as funnel (same entity as «По проекту») | `/bespoke` + `/bespoke/request` + backend module | B2C/pro | - | Quote only (no cart) | - | Request | Never cart | Product rules; no new OD | `/bespoke` |
| Designer trade programme | **Not evidenced** | No discount/% | Designers | - | - | - | - | - | **OD** | do not invent |
| Installment | **Not offered** on new site | Live CS-Cart only | - | - | - | - | - | `NOT NEW-SITE SOT` | closed OD-05 = A | do not promise |
| Online card checkout | **No** | `pp_system_default` plumbing only | B2C | - | - | After order, off-site | - | - | closed OD-05 = A | `/payment` copy: no on-site pay |
| PaymentLink / invoice | **Yes** (launch SoT) | Admin PaymentLink + owner OD-05 = A | B2C | - | After manager confirm | Off-site | Operator supplies URL | No auto-send / no webhook | closed | `/payment` READY_FOR_COPY_PHASE |

## Wall panels (стеновые панели)

### What we know

- Listed as brand capability in footer bullets (`Готовые модели`, `Окрашивание и роспись`, `Стеновые панели`).
- Appear in bespoke media alts and legacy product SEO (e.g. Oxford wall panel SKU).
- **No** buyer page for measurement, design, substrate requirements, install, warranty specifics, or ordering flow beyond generic Bespoke/request. Wall-panel **warranty** is `MISSING` (`OD-04` pack); do not invent a panel/install term. OD-08 remains OPEN.

### What we do **not** know (do not invent)

- Product vs project service vs both
- Who installs
- Whether measurement is required/paid
- Relationship to Bespoke classification
- Pricing model

### Recommended public IA (2026-08-20)

1. Capability mention under Woodright Bespoke (`/bespoke`) and `/designers` only.
2. No `/services`. No dedicated `/services/wall-panels`.
3. Soften footer to a capability, without install / measurement / tariff.

## Designers

### Claims present

- Audience: designers and architects, private/public interiors
- Help with models, finishes, room composition, timing, estimate
- Materials/samples/tech params on request
- CTA funnel collapses to `/bespoke/request`

### Claims absent

- Trade discount, commission, portal, contract pack, NDA, sample deposit/return, response SLA, dedicated manager

### Page recommendation

- **One** page «Дизайнерам» (merge landing + terms + materials section)
- Rename away from false «Условия сотрудничества» until commercial terms exist
- Optional later: real terms after OD (OD-trade)

## Bespoke boundary issues

| ID | Where | Promise | Why dangerous | Misunderstanding | Need |
| --- | --- | --- | --- | --- | --- |
| BB-01 | `footer.brandText.closing` | «Проекты любой сложности» | Absolute | Any request accepted | Soften COPY |
| BB-02 | `bespokeLanding.supporting` | «комната под ключ» | Sounds like full contractor (design+build+install) | Install/design included | Define or remove |
| BB-03 | `bespokeCatalogCopy.lead` | kitchens/wardrobes/… «по вашим размерам» | Implies unlimited typology | Catalog = full custom factory | Align with real directions |
| BB-04 | `bespoke-media` measure alt | Visual «замерщик» | Implies free site measure | Service exists | Remove alt implication or add real policy |
| BB-05 | Offer rem subject | «сопутствующие услуги по согласованию» | Vague services bag | Everything negotiable forever | List or narrow after OD |
| BB-06 | Designers = same form as Bespoke | One funnel | Trade ≠ consumer | Wrong expectations | Tag audience; later separate terms |

Code still correctly blocks BESPOKE from cart (`product-rules`) - keep info pages from undoing that.

**Product model (owner clarification 2026-08-17):** Woodright Bespoke is the new name and premium rethink of «По проекту», not a parallel service. `STANDARD` = ready product; `CONFIGURABLE` = preset options of that product (still cart); `BESPOKE` = beyond presets (never cart). `/bespoke/catalog` is not default IA. **`BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`** (see OD-03 pack).

**2026-08-17 proof pack:** `docs/content-audit/BESPOKE_POSITIONING.md`. Owner-confirmed experience and named legacy projects. Do not treat restoration, gilding, bronze, or Mariinsky-style install as a current service list. «30%» / «эскиз в подарок» = `REJECT AS NEW-SITE SOT`.

## Tone patterns (representative)

| Pattern | Example | Fix class |
| --- | --- | --- |
| Absolute marketing | «Проекты любой сложности» | COPY |
| Undefined service metaphor | «под ключ» | OWNER + COPY |
| Title/body mismatch | `/designers/terms` without terms | IA rename |
| Factory word ≠ home service | «аккуратная сборка» in about/production | COPY clarify |
| Legal honesty + unfinished docs | checkout accepts оферта while offer `owner_review` | LEGAL REVIEW |
| Live demo pollution | «Демо Магазин» on public returns | P0 fix on public/legacy |
| SEO/legacy city chooser | feedback form cities Москва / СПб on public | STALE chrome |

## Representative COPY rewrites (facts already safe)

Only where meaning is confirmed and no OD required:

**1. Footer closing**
Was: `Проекты любой сложности`
Safer: `Проектные решения по запросу`

**2. Bespoke supporting**
Was: `…и с комнатой под ключ`
Safer (until OD defines turnkey): `…и с комплектацией комнаты под задачу`

**3. Designers terms H1/nav**
Was: `Условия сотрудничества`
Safer: `Дизайнерам и архитекторам` (drop «условия» until terms exist)

Returns SOP verified 2026-09-01 (`docs/owner/returns-sop.md`); storefront `/returns` not shipped. Warranty **term** 12 months (`OD-04 = B`); start / seller-obligor / narrow exclusions in `docs/owner/warranty-public-policy.md` (spec ready; storefront not shipped). Delivery **pricing** (`OD-02 = B`) and payment (`OD-05 = A`) remain copy-phase - storefront not updated in the ratification tasks. Do not add lift/assembly/pickup/geography to `/delivery` without further owner authority.
