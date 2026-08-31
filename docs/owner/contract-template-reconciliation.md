# Woodright client contract template - controlled reconciliation

**Document role:** operator record for the *external* 2026 client supply-contract Word template. Not a replacement contract. Not buyer-facing copy. Not a new owner decision.
**Created:** 2026-08-30 (Europe/Moscow).
**Updated:** 2026-08-31 (Europe/Moscow) after verified Word warranty mutation, then postal-index mutation.
**Status tokens:** `WOODRIGHT_WARRANTY_WORD_SOURCE_RECONCILED`; `WOODRIGHT_POSTAL_INDEX_RECONCILED`

Website commercial SoT: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md`  
OD board: `docs/content-audit/OWNER_DECISIONS.md`

```text
OWNER-DECIDED COMMERCIAL TERM RECONCILIATION
OD-04 = B
WEBSITE COMMERCIAL WARRANTY = 12 MONTHS
THIS FILE IS NOT EXTERNAL LEGAL REVIEW
THIS FILE IS NOT A FULL REPLACEMENT CONTRACT
DO NOT OVERWRITE THE OWNER'S ONLY SOURCE FILE FROM THIS REPO
```

---

## 1. Contract source audit (this cycle)

Searched tracked `docs/`, `docs/owner/`, `docs/content-audit/`, and storefront legal SoT on fresh `origin/main`. No `.docx` / `.doc` client-contract source is stored in git.

| Source | Path / location | Tracked? | Classification |
| --- | --- | --- | --- |
| 2026 client supply-contract Word template | Operator file `ДОГОВОР с клиентами Роэл-Техник.docx` (title in file: `ДОГОВОР ПОСТАВКИ ТОВАРА`, ООО «Роэл-Техник», year line `2026 г.`) | **No** - not in git | **Canonical editable business template** (external). Authority for *future customer paper* until replaced. |
| Persist of extracted facts | `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md` | Yes | **Legal/content SoT** - provenance of the template, not the contract itself |
| This file | this file | Yes | Verification record of the 2026-08-31 Word warranty-term and postal-index edits; not the contract binary |
| Live CS-Cart `/dogovor-postavki/` | `https://woodright.ru/dogovor-postavki/` | n/a | **Legacy public HTML** - not the editable 2026 Word source; `LEGACY PUBLIC` |
| Live CS-Cart `/oferta/` | `https://woodright.ru/oferta/` | n/a | **Legacy public HTML** (2022 oferta still served) |
| Dump EN oferta/dogovor | LEG-SQL | n/a | **Stale other-seller** (ИП Елисеев) |
| Storefront `legal-content.ts` / `woodright-copy.ts` | `apps/storefront/src/lib/legal/` | Yes | **Website copy** - `OD-04 = B` 12 months. Not the contract. **Not edited this cycle.** |

The `.docx` is **not** stored in git. Do not invent a second Word file in the repo.

**2026-08-31 (warranty):** the operator Word file `ДОГОВОР с клиентами Роэл-Техник.docx` (CTR-2026, not in git) was edited for the warranty **term only**. See §2. Returns, claims, and other non-warranty clauses were not changed in that pass.

**2026-08-31 (postal, later the same day):** the same Word file was then edited for the seller **postal index only** (`153000` → `153025`). See §4. Warranty 12 months / start-from-transfer, returns, claims, and other clauses were not changed in that pass.

---

## 2. Exact required warranty edit

Apply only to the **future customer contract** issued for new Woodright (the 2026 template), not to live CS-Cart in this cycle.

### Current (template provenance)

```text
Гарантийный срок ... составляет 18 (Восемнадцать) месяцев с момента передачи Товара.
```

Known close wording from the 2026 template / live `/dogovor-postavki/` §5.4 lineage:

> Гарантийный срок, предоставляемый Продавцом на все продаваемые им предметы мебели, при соблюдении правил эксплуатации, … составляет **18 (Восемнадцать) месяцев с момента передачи Товара**.

### Target approved commercial term

```text
Гарантийный срок ... составляет 12 (Двенадцать) месяцев с момента передачи Товара.
```

Keep:

```text
warranty begins from the moment the goods are transferred to the buyer
```

Do **not** change the start rule in the same edit. Do **not** change other contractual conditions in the same pass unless a later scoped legal task says so.

Provenance of the **12**:

```text
OD-04 = B
owner-approved launch commercial warranty = 12 months
WARRANTY_TERM_SOURCE = CURRENT OWNER DECISION
NOT legacy CS-Cart 18
NOT generic dump / ИП Елисеев 12
```

### Verification 2026-08-31 (Europe/Moscow)

```text
OWNER-DECIDED COMMERCIAL TERM RECONCILIATION
OD-04 = B
ACTUAL WORD SOURCE UPDATED = YES
VERIFIED WARRANTY TERM = 12 MONTHS
WARRANTY START = FROM TRANSFER OF GOODS
STATUS = WARRANTY TERM RECONCILED
THIS IS NOT EXTERNAL LEGAL REVIEW
```

Location category: operator Downloads. Filename: `ДОГОВОР с клиентами Роэл-Техник.docx`. Binary **not** stored in git. Absolute machine path is operator-local only.

| CAS | SHA-256 |
| --- | --- |
| Pre-change source / immutable backup | `c0ab92bd43f73d56c14f92b5c18c1d2268a52da3b7280c0d8f12cd3875fd308e` |
| Post-change active template | `7770b1fe6cbf3af51448e66e6aefe6b907833993048db9f89dbec3049167fb20` |

Backup filename (sibling, not in git): `ДОГОВОР с клиентами Роэл-Техник.PRE-OD04-18M.20260831T173111.docx` 
`BACKUP_SHA256 ==` pre-change source SHA-256.

Before (one commercial-warranty clause):

```text
18 (Восемнадцать) месяцев с момента передачи Товара
```

After (same clause; start rule unchanged):

```text
12 (Двенадцать) месяцев с момента передачи Товара
```

Structural check: only `word/document.xml` content hash changed; zip member list unchanged; three Word runs only (`18`→`12`, `В`→`Д`, `осемнадцать`→`венадцать`). Delivery `18.00` window, then-current postal `153000`, returns/PP 55, claims days, and requisites **not** edited in the warranty pass. Postal index was reconciled in a later same-day pass (§4).

```text
CURRENT CONTRACT TEMPLATE WARRANTY = 12 MONTHS
CURRENT WEBSITE OWNER DECISION = 12 MONTHS
WARRANTY START = FROM TRANSFER OF GOODS TO BUYER
STATUS = CONTRACT/WEBSITE WARRANTY TERM ALIGNED
PREVIOUS CTR-2026 TEMPLATE WORDING = 18 MONTHS
RECONCILED UNDER OD-04 = B
```

---

## 3. Contract vs website consistency matrix

| Topic | Contract template (CTR-2026) | Owner / current website | Status | Action |
| --- | --- | --- | --- | --- |
| Seller | ООО «Роэл-Техник»; ОГРН `1153702012848`; ИНН `3702111074`; КПП `370201001` | Same (`OD-01 = A`) | aligned | none |
| Warranty term | **12 months** (verified Word 2026-08-31; previous wording 18 months) | 12 months (`OD-04 = B`) | **aligned** | live CS-Cart `/oferta/` `/dogovor-postavki/` 18 months remain `LEGACY PUBLIC DIVERGENCE` |
| Warranty start | from transfer of goods to buyer | contract provenance same; website start wording still `LEGAL REVIEW` for `/warranty` pack | aligned as *contract provenance*; website copy not auto-closed | preserve transfer start in the template; do not invent a different clock |
| Warranty scope | production defects at assembly or during warranty use; seller inspects, acts, remedies confirmed defects at own cost | SoT + OD-04 pack: do not expand to wear / mechanical / misuse; do not waive statutory rights | scoped - keep | no public expansion |
| DIY delivery/lift/assembly vs warranty | service may be withheld except manufacturing defects | SoT: do not treat DIY as universal loss of warranty on production defects | watch | do not broaden the exclusion |
| Natural material | grain / texture / shade / fabric batch variation ≠ defect *by themselves* | SoT: not a blanket «any wood difference is not a defect» | aligned if kept narrow | do not broaden |
| Claims timing | 5 working days (warranty claims); 5 calendar days (dispute pretension) | `OD-06B` = no extra public SLA; `OD-06A` = submit is request, not acceptance | scoped mismatch | **no** public «ответим за 5 дней» |
| Delivery tariffs | Moscow 2000; МО 1000+50/km; lift %; assembly 3% | `OD-02 = B` quote-only | intentional divergence | do not publish tariff |
| Payment | cash to cashier and/or bank transfer; prepayment mechanics | `OD-05 = A` manager → invoice / PaymentLink | website constrained | preserve OD-05; do not rewrite site to cashier story |
| Returns | §5.10 + ПП РФ №55 от 19.01.1998; household furniture proper quality non-returnable | `OD-03 = B` manager-assisted + legal baseline; full SOP open | outdated contract wording | `LEGAL REFERENCE REQUIRES CURRENT LEGAL REVIEW` / `DO NOT PUBLISH AS-IS` |
| Postal index | **153025**, Иваново, Дзержинского 39, оф. 514 (verified Word 2026-08-31; previous wording **153000**) | owner card / `woodright-seller.ts` `153025` | **aligned** | historical CTR-2026 `153000` retained as provenance |
| Bank details | present in contract (legitimate in customer paper) | `OD-10 = B` not public on website | contextual difference | OK in contract / invoice; never copy account numbers into website SoT |
| Bespoke / spec | custom sizes + sketches in Счёт-заказ | Woodright Bespoke = same entity as «По проекту»; no cart | aligned concept | preserve; `BESPOKE` ≠ automatic no-return |

---

## 4. Postal index evidence (reconciled 2026-08-31)

Primary authority is the owner company card (`CURRENT OWNER CONFIRMED`, 2026-08-15), not aggregators. EGRUL aggregators are corroboration only. FNS `egrul.nalog.ru` interactive extract was not obtained this cycle (search UI without a session returned no extract); that absence is **not** a contradiction.

| Source | Address | Postal index | Classification |
| --- | --- | --- | --- |
| Owner company card (2026-08-15), recorded in `docs/owner/legal-content-owner-review.md` | г. Иваново, ул. Дзержинского, д. 39, оф. 514 | **153025** | `CURRENT OWNER CONFIRMED` |
| Canonical `apps/storefront/src/lib/legal/woodright-seller.ts` | same street/office | **153025** | `CURRENT CANONICAL IMPLEMENTATION` (code **not** changed this cycle) |
| `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md` / `OWNER_DECISIONS.md` OD-01 | same | **153025** | `CURRENT GOVERNANCE` |
| `docs/content-audit/FACT_LEDGER.md` LEG-001 | same | **153025** | owner card |
| Current 2026 client Word template (CTR-2026, after 2026-08-31 postal edit) | `153025 г. Иваново, ул. Дзержинского,39, оф 514` | **153025** | `CONTRACT TEMPLATE` aligned |
| CTR-2026 Word before postal edit (same file, post-warranty CAS) | `153000 г. Иваново, ул. Дзержинского,39, оф 514` | **153000** | `HISTORICAL` / previous contract-template value |
| Live CS-Cart legal HTML | not used as index authority this cycle | n/a | `LEGACY` public |

```text
CURRENT AUTHORITATIVE POSTAL INDEX = 153025
CURRENT SELLER POSTAL INDEX = 153025
CURRENT CONTRACT TEMPLATE POSTAL INDEX = 153025
PREVIOUS CONTRACT TEMPLATE VALUE = 153000
AUTHORITY = CURRENT OWNER CONFIRMED COMPANY CARD
ACTUAL WORD SOURCE UPDATED = YES
STATUS = POSTAL INDEX RECONCILED
CTR-2026 previously contained 153000
```

### Verification 2026-08-31 (Europe/Moscow) - postal

CAS continuity from the verified post-warranty Word (`7770b1fe6cbf3af51448e66e6aefe6b907833993048db9f89dbec3049167fb20`) held before the postal edit (`WORD_CAS_CONTINUITY = PASS`). Immutable sibling backup (not in git): `ДОГОВОР с клиентами Роэл-Техник.PRE-POSTAL-153000.20260831T184508.docx`. `BACKUP_SHA256` equals the pre-postal source SHA.

| CAS | SHA-256 |
| --- | --- |
| Pre-postal source / PRE-POSTAL backup (post-warranty Word) | `7770b1fe6cbf3af51448e66e6aefe6b907833993048db9f89dbec3049167fb20` |
| Post-postal active template | `d5adce0e3de51b4b440f817c491f99522a1b33fe4f13831a09d28cb96fe3ad65` |

Exact seller-requisites run (Word punctuation preserved; one `w:t` run only):

```text
before: 153000 г. Иваново, ул. Дзержинского,39, оф 514
after:  153025 г. Иваново, ул. Дзержинского,39, оф 514
```

Structural check: only `word/document.xml` content hash changed; zip member list unchanged; one text run (`153000` → `153025`). Warranty `12 (Двенадцать) месяцев с момента передачи Товара` unchanged. Seller, street, house, office, ОГРН, ИНН, КПП, payment, delivery, claims, returns, and bank requisites unchanged. Binary **not** in git.

---

## 5. Warranty start, scope, exclusions, natural material

**Start (contract):** from transfer of the goods to the buyer. Preserve. Website `/warranty` start sentence remains `LEGAL REVIEW` in `OD04_WARRANTY_VERIFICATION.md` until the legal pack says otherwise. Provenance ≠ silent close of that review.

**Scope (contract):** manufacturing defects found at assembly or during the warranty period. Seller may inspect quality, record an act, choose the remedy, and fix confirmed defects at the seller’s cost. Do not expand to any damage, natural wear, mechanical damage, or misuse. Do not add extra limits on statutory consumer rights.

**Exclusions (contract):** breach of use rules; unauthorized repair; mechanical damage; intentional damage; third-party unlawful acts; force majeure. Separate clause: delivery / lift / assembly by the buyer or third parties, **except manufacturing defects**. Do **not** rewrite that exception into «DIY delivery voids all warranty including production defects».

**Natural material (contract):** differences of grain, texture, natural-wood shade, and fabric shade between batches are not manufacturing defects *by themselves*. Do **not** publish «any difference / damage / defect of natural wood is not a defect».

---

## 6. Claims and returns (do not close)

```text
OD-06A = IMPLEMENTATION DECISION + LEGAL REVIEW
ORDER_SUBMIT_IS_REQUEST_NOT_ACCEPTANCE

OD-06B = NO ADDITIONAL COMMERCIAL PROMISE
NO EXTRA COMMERCIAL SLA
```

Contract 5 working / 5 calendar days stay **provenance**. Not a website SLA.

```text
OD-03 = B
RETURNS_LAUNCH_MODEL = MANAGER_ASSISTED
WOODRIGHT_CUSTOM_RETURN_SOP = NOT YET APPROVED
```

Launch communication is ratified. Full returns legal pack / SOP is **not** closed. Do not flatten to `OD-03 OPEN`. Do not claim returns completely solved.

ПП РФ №55 от 19.01.1998 in the template:

```text
LEGAL REFERENCE REQUIRES CURRENT LEGAL REVIEW
DO NOT PUBLISH AS-IS
```

Current new-site legal baseline for furniture proper-quality lists is **not** that 1998 decree (see `OD03_RETURNS_VERIFICATION.md`: PP 31.12.2020 N 2463 + remote-sale note). Do not replace that baseline with the old contract sentence. `BESPOKE` is not an automatic no-return rule.

---

## 7. Bank details vs public website

```text
OD-10 = B
BANK DETAILS NOT PUBLIC
NOT PUBLIC != must not exist in the customer contract
```

Account numbers may remain in the Word contract and in private invoices. They must **not** be copied into `SITE_COMMERCIAL_SERVICE_SOT.md` or other public-content governance. This file does not repeat them.

---

## 8. Seller identity conflicts (read-only)

Canonical new-site seller is ООО «Роэл-Техник» (OGRN/INN/KPP as in section 3). Do not change the entity.

| Path | What | Class |
| --- | --- | --- |
| Live `https://woodright.ru/vozvrat/` | ООО «Демо Магазин»; `sales@demostore.ru`; 14 days; PP 55 | `LEGACY PUBLIC DEFECT` - not this cycle |
| Live `https://woodright.ru/oferta/` §15 (OD04 pack) | still prints **ЗАО «Роэл-Техник»** in chrome | legacy HTML; `OD-01 = A` not reopened |
| LEG-SQL EN oferta/dogovor | **ИП Елисеев** | `STALE` / other seller |
| Canonical `legal-content.ts` / fidelity tests | asserts no «Демо Магазин»; warranty 12 months | aligned with OD-01 / OD-04 |

---

## 9. Contract template issues ledger

Observed from CTR-2026 persist + live `/dogovor-postavki/` lineage. **Not** a mass legal rewrite authority. Original `.docx` was not re-opened in this worktree.

| ID | Severity | Issue | Action this cycle |
| --- | --- | --- | --- |
| CTI-P0-01 | P0 (closed 2026-08-31 for *Word template term*) | Was: warranty **18** vs `OD-04 = B` **12** | Word source verified `12 (Двенадцать) месяцев с момента передачи Товара`. Live CS-Cart 18 months still legacy. |
| CTI-P0-02 | P0 | Returns §5.10 + PP 55 (1998) as furniture non-return rule | do not publish; legal review; keep OD-03 = B nuance |
| CTI-P0-03 | P0 (closed 2026-08-31 for *Word template index*) | Was: postal **153000** vs owner card **153025** | Word source verified `153025 г. Иваново, ул. Дзержинского,39, оф 514`. Historical `153000` retained as provenance. |
| CTI-P1-01 | P1 | Warranty claim **5 working days** vs dispute **5 calendar days** | keep both as provenance; no public SLA |
| CTI-P1-02 | P1 | DIY delivery/lift/assembly vs warranty - must keep manufacturing-defect exception | do not broaden |
| CTI-P1-03 | P1 | Natural-material sentence can be over-read as a blanket defect waiver | keep SoT narrow wording |
| CTI-P1-04 | P1 | Live oferta annex = manufacturer 18 months vs live dogovor = seller 18 months (obligor). Current Word template term is now **12** months seller | `WARRANTY_OBLIGOR_LEGAL_WORDING = LEGAL REVIEW`; OD-04 does not close obligor |
| CTI-P1-05 | P1 | Obsolete legal reference PP 55 | `DO NOT PUBLISH AS-IS` |
| CTI-P2-01 | P2 | Delivery clause numbering restarts after `3.1.4` at `3.1.1` (known CTR-2026 extract) | editorial; no rewrite this cycle |
| CTI-P2-02 | P2 | `Счет-заказ` / `Счёт-заказ` spelling mix in the family of texts | editorial |
| CTI-P2-03 | P2 | Live dogovor care URL still `wdrt.ru` | legacy HTML; not Word-edit this cycle |

Delivery/payment **tariffs and cashier wording** are intentional website divergence (`OD-02`, `OD-05`), not drafting typos.

---

## 10. Legal pack status after this cycle

| Item | Status |
| --- | --- |
| Website commercial warranty term | **12 months** - `OD-04 = B` |
| Actual 2026 Word source | **12 months** - verified 2026-08-31 (CAS in §2) |
| 12/18 *template vs website* consistency gate | **closed** for the Word source |
| Historical 18-month CTR-2026 wording | retained as provenance |
| Warranty start in template | from transfer - unchanged |
| `/warranty` obligor / exclusions / start *copy* | still `LEGAL REVIEW` |
| Postal index | **closed** (`WOODRIGHT_POSTAL_INDEX_RECONCILED`; previous CTR-2026 value `153000`) |
| Returns SOP | **open** (`OD-03 = B` model only) |
| Public claims SLA | **must not add** (`OD-06B`) |
| Full legal pack token | `OWNER_LEGAL_CONTENT_APPROVED` **not** issued |
| Live CS-Cart | untouched; separate cutover |
| Storefront / runtime / deploy | untouched |
