# Woodright warranty public-policy spec (canonical)

**Document role:** spec for future `/warranty` copy. Not production copy. Not a new owner decision. Not `OWNER_LEGAL_CONTENT_APPROVED`.
**Created:** 2026-09-01 (Europe/Moscow).
**Status token:** `WARRANTY_PUBLIC_POLICY_VERIFIED_AND_READY`

Returns / intake: `docs/owner/returns-sop.md`
Legal ledger: `docs/content-audit/RETURNS_WARRANTY_LEGAL_LEDGER.md`
Term + CAS: `docs/owner/contract-template-reconciliation.md`
OD board: `docs/content-audit/OWNER_DECISIONS.md`

```text
OD-04 = B
COMMERCIAL WARRANTY = 12 MONTHS
START = FROM TRANSFER OF GOODS TO THE BUYER
COMMERCIAL OBLIGOR = SELLER ООО «Роэл-Техник»
COMMERCIAL WARRANTY != STATUTORY DEFECT RIGHTS
PRODUCT LABEL != AUTOMATIC WARRANTY TERM
PUBLIC_CLAIMS_SLA = NO (OD-06B)
```

---

## Confirmed public facts

These may be used in future `/warranty` after an implementation cycle. This file does **not** ship storefront text.

### Term

**12 months.** Authority: `OD-04 = B` (2026-08-19) + current CTR-2026 Word (verified 2026-08-31). Live CS-Cart 18 months = `LEGACY PUBLIC DIVERGENCE`.

STANDARD / CONFIGURABLE / BESPOKE do **not** get a different term from the label.

### Start

**From transfer of the goods to the buyer.**

| Source | Wording | Status |
| --- | --- | --- |
| Current CTR-2026 | `12 (Двенадцать) месяцев с момента передачи Товара` | contract confirmed |
| ЗоЗПП ст. 19 п. 2 | warranty clock generally from transfer unless contract says otherwise | `EXTERNAL VERIFICATION`; no conflict |
| Live `/oferta/` annex | transfer to buyer or representative | legacy public; same sense |

No legal contradiction found with publishing:

> Гарантийный срок - 12 месяцев с момента передачи товара покупателю.

Do **not** add «после 12 месяцев претензии невозможны». After the commercial term, ст. 19 п. 5 / ГК ст. 477 п. 5 still allow claims within **2 years** if the consumer proves pre-transfer cause.

### Obligor (commercial warranty)

| Source | Who promises | Status |
| --- | --- | --- |
| Current CTR-2026 | гарантийный срок, предоставляемый **Продавцом** | `CONTRACT / BUSINESS AUTHORITY` |
| `OD-01 = A` | seller ООО «Роэл-Техник» | `CURRENT OWNER CONFIRMED` |
| Claims in template | addressed to the seller | contract |
| Canonical `woodright-seller.ts` | ООО «Роэл-Техник» | implementation; **not** edited this cycle |
| Live `/oferta/` annex | **производитель** (unnamed) 18 months | `LEGACY PUBLIC DIVERGENCE` |
| Live `/oferta/` §12.1 | производитель via label | legacy |
| Live `/dogovor-postavki/` §5.4 | **Продавец** 18 months | legacy number; obligor sense matches current Word |
| Manufacturer legal name | not confirmed | `MANUFACTURER = NOT YET CONFIRMED` |

Safe public candidate (commercial layer only):

> Гарантию по заказу предоставляет продавец - ООО «Роэл-Техник»

Do **not** publish «гарантия производителя». Statutory ст. 18 still lets a consumer claim against manufacturer / importer **if identified**; that is not a reason to hide the seller as commercial obligor, and not a reason to invent a factory name.

### Scope

Commercial warranty covers **manufacturing defects** found during the warranty period (including defects found at assembly). Seller may inspect quality, record findings, and perform the confirmed **consumer-chosen** statutory remedy (or the agreed warranty repair) without becoming the sole judge against mandatory rights (ст. 16 / ст. 18).

Safe sense:

> Если в течение гарантийного срока обнаружен производственный недостаток, обратитесь в Woodright. При необходимости проводится проверка качества.

Hardware / mechanisms / upholstery / panels: **no separate confirmed terms**. Do not port live oferta §12.2 carve-out. Do not say «на фурнитуру гарантии нет».

### Natural material

Contract: grain, texture, natural-wood shade, and small fabric-batch shade differences are **not manufacturing defects by themselves**.

```text
NATURAL VARIATION != DEFECT BY ITSELF
NATURAL MATERIAL != IMMUNITY FROM MANUFACTURING DEFECTS
```

Safe candidate:

> Рисунок древесины, фактура и оттенок могут отличаться. Это особенность натурального материала, а не недостаток сам по себе. Производственные недостатки рассматриваются отдельно.

### Claims intake

Same as returns SOP: contact a Woodright manager via `showroom-contacts.ts`. Order number if any. Photos optional. No invented email. No «ответим за 5 дней».

CTR-2026 **5 working days** (warranty claims) vs **5 calendar days** (dispute pretension) = **contract provenance**. Internal inconsistency. **Not** a website promise (`OD-06B`). Future Word cleanup: yes. Public SLA: no.

### After-warranty service

Contract allows paid service after the warranty or for non-warranty cases. No owner restriction found against the following candidate. No lifetime service.

> После окончания гарантийного срока можно обратиться в Woodright по вопросу сервисного обслуживания. Возможность и стоимость работ определяются индивидуально.

---

## Safe exclusions (verified for public use)

Each row is the **narrow** public meaning. Blanket «гарантия аннулируется» is `SUSPECT` (ст. 16).

| Topic | CONTRACT SOURCE | LEGAL STATUS | SAFE PUBLIC WORDING | NEEDS LEGAL REVIEW |
| --- | --- | --- | --- | --- |
| Use-rule breach | CTR-2026 exclusions | seller may deny **commercial** warranty if seller proves post-transfer consumer cause (ст. 18 п. 6) | Гарантия не покрывает повреждения из-за нарушения правил эксплуатации | Named care numbers as **void** still review |
| Mechanical damage | CTR-2026 | same | Не покрывает механические повреждения после передачи, если это не производственный недостаток | - |
| Unauthorized repair | CTR-2026 | same | Не покрывает последствия самостоятельного ремонта неуполномоченными лицами | - |
| Third parties / intent | CTR-2026 | same | Не покрывает умысел и действия третьих лиц | - |
| Force majeure | CTR-2026 | same | Не покрывает непреодолимую силу | - |
| Wear | implied by manufacturing-defect scope | do not invent extra list | Естественный износ не является производственным недостатком сам по себе | - |
| DIY delivery / lift / assembly | CTR-2026: no warranty **service** except manufacturing defect | **do not** publish total void | Гарантия не распространяется на повреждения, возникшие вследствие самостоятельной перевозки, подъёма, сборки или установки. Это не ограничивает обращения по независимым производственным недостаткам. | Over-read of «обслуживание не производится» |
| Natural variation | CTR-2026 5.1–5.2 | see above | variation ≠ defect by itself | blanket «любая разница дерева - не дефект» |
| Humidity / uneven floor / commercial use | live oferta care | **not** current approved exclusions | do not publish as void list | `SUSPECT` |
| Keep talon / packaging | live oferta | no current talon | do not tell buyers to keep a talon | - |

---

## Statutory-rights disclaimer

Required sense:

> Коммерческая гарантия не заменяет обязательные права потребителя при недостатках товара.

Repair timing in live oferta «45 календарных дней» is **not** new-site SoT and is **not** an `OD-06` pick. Statutory ст. 20 remains `EXTERNAL VERIFICATION` if a repair demand is made; do not publish a Woodright 45-day promise.

---

## Forbidden overclaims

- «Гарантия производителя» without a named manufacturer
- «На всю мебель без исключений» / invented component matrix
- «Если сами собрали / подняли - гарантия сгорела»
- «После 12 месяцев прав нет»
- «Без талона / без чека / без фото не примем»
- Free master visit, free replacement as a marketing promise
- Any Woodright claims SLA (3 / 5 / 10 / 30 / 45 days as **service** promise)
- Different commercial term from `BESPOKE` / `CONFIGURABLE` labels

---

## Remaining legal gaps

| Gap | Blocks this spec? |
| --- | --- |
| Manufacturer legal name | No (do not publish) |
| Component-specific terms | No (do not invent) |
| Humidity / floor / B2B-use voids | Yes for those **sentences** only; omit |
| Formal TG/WA-as-claim-filing | Channel-neutral SOP already |
| Word 5/5-day clause cleanup | Future Word; not public copy |
| Storefront `/warranty` implementation | Next cycle |
| `OWNER_LEGAL_CONTENT_APPROVED` | Full pack still open |

Copy candidates in `OD04_WARRANTY_VERIFICATION.md` remain `NOT IMPLEMENTED`. Prefer this spec over the older «do not add с момента передачи» line: that gate is **closed** for the spec (contract + statute aligned). Implementation still must not ship until a storefront task.
