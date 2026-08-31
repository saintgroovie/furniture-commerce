# Source index

Audit date: 2026-08-12 (Europe/Moscow)

## A. Current / new storefront

| ID | Path | Role | Age signal |
| --- | --- | --- | --- |
| SF-CANON | `…/Documents/projects/furniture-commerce/apps/storefront` | Main checkout feature branch; `/contacts`, `/about*`, `/designers*`, `/bespoke*`; **no** `/delivery` `/payment` `/returns` `/privacy` etc. | branch `feat/storefront-home-kids-landing` |
| SF-REM | `…/Developer/woodright-legal-content-remediation-20260804/apps/storefront` | Rich legal SoT: 10 legal routes + `lib/legal/*` | 2026-08-04 `owner_review` |
| SF-OPS | `…/.woodright-worktrees/ops-mutation-…/apps/storefront` | Older legal pack (7 pages, prep chrome titles) | post-upgrade ops tree |
| COPY-REM | `SF-REM/.../woodright-copy.ts` | Buyer microcopy, footer, checkout honesty, designers/bespoke | synced with rem |
| COPY-CANON | `SF-CANON/.../woodright-copy.ts` | Same marketing layer; thinner footer legal set; links to missing routes | |
| SHOW-REM | `SF-REM/.../showroom-contacts.ts` | Confirmed showroom SoT (phones, address, MAX, maps) | owner-curated in rem |
| SHOW-CANON | `SF-CANON/.../showroom-contacts.ts` | Same phones/address; MAX `href: null`; no Yandex URL | older |
| LEGAL-CONTENT | `SF-REM/.../lib/legal/legal-content.ts` | Page bodies for privacy/offer/delivery/… | version `2026.08.04-owner-review` |
| OWNER-INPUTS | `SF-REM/.../lib/legal/owner-inputs.ts` | Schema of required owner fields (env `WOODRIGHT_LEGAL_*`) | repo env still empty; seller confirmed in owner docs, not wired into storefront |
| LEGAL-STATUS | `SF-REM/.../lib/legal/legal-status.ts` | `status: owner_review`, `approvalId: null` | blocks launch |

## B. Owner / evidence docs

| ID | Path | Role |
| --- | --- | --- |
| OWN-REV-CANON | `docs/owner/legal-content-owner-review.md` | Canonical living packet: OD-01 A + OD-10 B (2026-08-15); full pack still `owner_review` |
| OWN-REV-REM | `SF-REM/docs/owner/legal-content-owner-review.md` | Historical 2026-08-04 packet (identity was MISSING). Not current seller SoT |
| OWN-PKT | `SF-REM/docs/evidence/public-launch-20260730/owner-legal-decision-packet.md` | Older Q-only packet; no answers |
| MANIFEST-REM | `SF-REM/docs/evidence/.../legal-manifest.json` | 10 pages × `owner_review` |
| MANIFEST-OPS | ops worktree same path | 5 keys draft/missing |

## C. Legacy

| ID | Path | Role | Age |
| --- | --- | --- | --- |
| LEG-SQL | `/Users/leonidmbp/Documents/woodright-legacy-private-export/2026-07-15/.../backup_4.14.2.SP1_02Jun2025_010814.sql` | CS-Cart 4.14.2 dump; `cscart_pages` bodies | dump name **02 Jun2025**; copy 2026-07-15 |
| LEG-SCRAPE | `SF-CANON/data/raw/legacy/` | Product HTML scrape; footer/nav/phones; **no** full service page bodies | ~2026-03-18 |

### Legacy pages extracted (RU titles)

| Slug | Title | Notes |
| --- | --- | --- |
| `/dostavka-i-sborka` | Доставка и сборка | Tariffs + lift % + assembly 3% |
| `/oplata-i-dostavka` | Оплата и рассрочка | B2B безнал, QR, card, Sberbank, «своя рассрочка» |
| `/vozvrat` | Возврат | 14 days + **CS-Cart Demo Magazin** pollution |
| `/oferta` | Оферта | ООО «Роэл-Техник», 18 months warranty, bank details |
| `/dogovor-postavki` | Договор поставки | Alternate delivery = 1% (conflicts with page tariffs) |
| `/politika-konfidencialnosti` | Политика конфиденциальности | Entity Роэл-Техник |
| `/pravila-ekspluatacii` | Правила эксплуатации | Care rules |
| `/kontakty` | Контакты | Empty description in dump |
| `/servis-razrabotki-intererov-woodright-dizayn` | Woodright дизайн | Empty body |
| Nav-only | `/dileram-i-dizayneram`, `/instrukcii-po-sborke-mebeli` | Links without usable body in dump |

## D. Live public site (secondary observation)

Probed 2026-08-12:

| URL | HTTP | Observation |
| --- | --- | --- |
| `https://woodright.ru/` | 200 | Footer: hours `Пн-Вс 10.00-21.00`, emails `woodright.t@yandex.ru`, `order@woodright.com`, phones match showroom |
| `https://woodright.ru/dostavka-i-sborka/` | 200 | Still shows **2000 ₽** Moscow + МО formula + lift/assembly % |
| `https://woodright.ru/oplata-i-dostavka/` | 200 | Sberbank partner, installment, безнал |
| `https://woodright.ru/vozvrat/` | 200 | 14 days + **ООО «Демо Магазин» / sales@demostore.ru** still live (**re-probed 2026-08-17**) |
| `https://woodright.ru/oferta/` | 200 | Роэл-Техник + 18 months + bank requisites. **Re-probed 2026-08-19:** annex still «гарантийный срок производителя … 18 месяцев с момента передачи»; §12.2 hardware/accessories carve-out. **Not** new-site SoT (`OD-04 = B` = 12 months owner-set). Live 18 months = `LEGACY PUBLIC DIVERGENCE` |
| `https://woodright.ru/kontakty/` | 404 | Contacts via footer/home only |
| `http://127.0.0.1:3002/delivery` | 404 | LaunchAgent QA stack = canon tree without legal routes |
| `http://127.0.0.1:3002/privacy` | 404 | same |

Live copy ≠ owner-confirmed SoT for the new site. Treat as **PUBLIC OBSERVATION / STALE RISK**.

**2026-08-15:** live `/dostavka-i-sborka/` curl **timed out**. Dump re-read: RU page 26 = 2000 / 1000+50 / lift % / assembly 3%; dogovor + page 26 `en` = delivery **1%** (not assembly). No `.xlsx` tariff in canonical repo. Evidence pack: `docs/content-audit/OD02_DELIVERY_SERVICES_VERIFICATION.md`.

**2026-08-17:** `OD-02 = B` owner-ratified. Those dump/live numbers stay `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT`. Checkout `0 ₽` = `CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL`.

## E. Owner-confirmed seller (2026-08-15)

| ID | Source | Role |
| --- | --- | --- |
| OWN-CARD-20260815 | Owner-provided current company card / карточка предприятия ООО «Роэл-Техник» | Seller identity + internal bank. Card issue date **not stated** - do not invent. Canonical record: `docs/owner/legal-content-owner-review.md` |

Tokens: `OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK` · `OWNER_DECISION_OD01_A_CONFIRMED` · `OWNER_DECISION_OD10_B_BANK_DETAILS_NOT_PUBLIC`

## F. 2026 client contract template (persisted 2026-08-28)

| ID | Source | Role |
| --- | --- | --- |
| CTR-2026 | Operator file: client `ДОГОВОР ПОСТАВКИ ТОВАРА` template, ООО «Роэл-Техник», dated 2026. **Not stored in git.** | Provenance for commercial/service terms. **Not** automatic public website policy. Canonical persist: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md` |
| CTR-2026-AMEND | `docs/owner/contract-template-reconciliation.md` | Word term **12 months** verified 2026-08-31 (`OD-04 = B`); start-from-transfer preserved. Historical 18-month wording recorded. **Not** a stored `.docx`. |

Do not treat this template’s ₽/% tariffs or §5.10 returns wording as new-site SoT. Warranty **term** of the current Word file is **12 months** (verified 2026-08-31); earlier 18-month wording is provenance. Owner decisions in `OWNER_DECISIONS.md` still win for website behavior; remaining contract/website conflicts stay explicit gates in the commercial SoT.

## G. External verification (existence only; superseded for *seller* SoT)

| Claim | Source | Status |
| --- | --- | --- |
| ООО «РОЭЛ-ТЕХНИК» ИНН 3702111074 ОГРН 1153702012848 exists, Ivanovo, furniture retail OKVED | Aggregators citing EGRUL (checko/rusprofile/spark) | `EXTERNAL VERIFICATION` of **existence** (corroboration) |
| Same entity is the seller for the *new* Woodright site | Owner card 2026-08-15 | **`FACT — CURRENT OWNER CONFIRMED`** (`OD-01 = A`). Privacy email still MISSING. Full legal pack not approved. |

## H. Not used / out of scope

- Catalog SKU pricing, media boards, Docker/ops evidence (except noting launch gate)
- Invented tariffs from «industry norms»
- Third-party SEO blogs as legal truth
