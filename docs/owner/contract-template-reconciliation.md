# Woodright client contract template - controlled reconciliation

**Document role:** operator instruction for the *external* 2026 client supply-contract Word template. Not a replacement contract. Not buyer-facing copy. Not a new owner decision.  
**Created:** 2026-08-30 (Europe/Moscow).  
**Status token:** `WOODRIGHT_WARRANTY_CONTRACT_UPDATE_READY`  
**Does not close:** `UNRESOLVED CONTRACT/WEBSITE CONSISTENCY GATE` until the actual future customer contract source is edited.

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
| This instruction | this file | Yes | **Controlled amendment / draft instruction** |
| Live CS-Cart `/dogovor-postavki/` | `https://woodright.ru/dogovor-postavki/` | n/a | **Legacy public HTML** - not the editable 2026 Word source; `LEGACY PUBLIC` |
| Live CS-Cart `/oferta/` | `https://woodright.ru/oferta/` | n/a | **Legacy public HTML** (2022 oferta still served) |
| Dump EN oferta/dogovor | LEG-SQL | n/a | **Stale other-seller** (ИП Елисеев) |
| Storefront `legal-content.ts` / `woodright-copy.ts` | `apps/storefront/src/lib/legal/` | Yes | **Website copy** - `OD-04 = B` 12 months. Not the contract. **Not edited this cycle.** |

**Absence this cycle:** the original `.docx` is not in the isolated worktree or git. Do not reconstruct a full juridical contract from memory. Do not invent a second Word file in the repo.

When the operator next edits the Word template, use **section 2** as the exact warranty change. Do not re-open the 12 vs 18 commercial-term choice: `OD-04 = B` already closed it for new Woodright.

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

After the Word file is actually saved with 12 months, record that fact in `SITE_COMMERCIAL_SERVICE_SOT.md` and only then flip:

```text
CONTRACT TEMPLATE RECONCILED TO 12 MONTHS
WEBSITE OWNER DECISION = 12 MONTHS
CONSISTENCY = ALIGNED
```

Until that source edit exists:

```text
CONTRACT TEMPLATE = 18 MONTHS
APPROVED AMENDMENT INSTRUCTION = 12 MONTHS
STATUS = WAITING FOR CONTRACT SOURCE UPDATE
UNRESOLVED CONTRACT/WEBSITE CONSISTENCY GATE  (still open)
```

---

## 3. Contract vs website consistency matrix

| Topic | Contract template (CTR-2026) | Owner / current website | Status | Action |
| --- | --- | --- | --- | --- |
| Seller | ООО «Роэл-Техник»; ОГРН `1153702012848`; ИНН `3702111074`; КПП `370201001` | Same (`OD-01 = A`) | aligned | none |
| Warranty term | 18 months | 12 months (`OD-04 = B`) | conflict | apply section 2 to Word source; do not change website 12 → 18 |
| Warranty start | from transfer of goods to buyer | contract provenance same; website start wording still `LEGAL REVIEW` for `/warranty` pack | aligned as *contract provenance*; website copy not auto-closed | preserve transfer start in the template; do not invent a different clock |
| Warranty scope | production defects at assembly or during warranty use; seller inspects, acts, remedies confirmed defects at own cost | SoT + OD-04 pack: do not expand to wear / mechanical / misuse; do not waive statutory rights | scoped - keep | no public expansion |
| DIY delivery/lift/assembly vs warranty | service may be withheld except manufacturing defects | SoT: do not treat DIY as universal loss of warranty on production defects | watch | do not broaden the exclusion |
| Natural material | grain / texture / shade / fabric batch variation ≠ defect *by themselves* | SoT: not a blanket «any wood difference is not a defect» | aligned if kept narrow | do not broaden |
| Claims timing | 5 working days (warranty claims); 5 calendar days (dispute pretension) | `OD-06B` = no extra public SLA; `OD-06A` = submit is request, not acceptance | scoped mismatch | **no** public «ответим за 5 дней» |
| Delivery tariffs | Moscow 2000; МО 1000+50/km; lift %; assembly 3% | `OD-02 = B` quote-only | intentional divergence | do not publish tariff |
| Payment | cash to cashier and/or bank transfer; prepayment mechanics | `OD-05 = A` manager → invoice / PaymentLink | website constrained | preserve OD-05; do not rewrite site to cashier story |
| Returns | §5.10 + ПП РФ №55 от 19.01.1998; household furniture proper quality non-returnable | `OD-03 = B` manager-assisted + legal baseline; full SOP open | outdated contract wording | `LEGAL REFERENCE REQUIRES CURRENT LEGAL REVIEW` / `DO NOT PUBLISH AS-IS` |
| Postal index | `153000`, Иваново, Дзержинского 39, оф. 514 | owner card / `woodright-seller.ts` `153025` | conflict | `POSTAL_INDEX_RECONCILIATION_REQUIRED` - do not guess |
| Bank details | present in contract (legitimate in customer paper) | `OD-10 = B` not public on website | contextual difference | OK in contract / invoice; never copy account numbers into website SoT |
| Bespoke / spec | custom sizes + sketches in Счёт-заказ | Woodright Bespoke = same entity as «По проекту»; no cart | aligned concept | preserve; `BESPOKE` ≠ automatic no-return |

---

## 4. Postal index evidence

Do **not** change the contract index from this file. Company-card / owner confirmation is required to pick a side. EGRUL aggregators are not a substitute owner authority here.

| Source | Address | Postal index | Authority / status |
| --- | --- | --- | --- |
| Owner company card (2026-08-15), recorded in `docs/owner/legal-content-owner-review.md` | г. Иваново, ул. Дзержинского, д. 39, оф. 514 | **153025** | `CURRENT OWNER CONFIRMED` for new-site identity |
| Canonical `apps/storefront/src/lib/legal/woodright-seller.ts` | same street/office | **153025** | follows owner card (code **not** changed this cycle) |
| `docs/content-audit/FACT_LEDGER.md` LEG-001 | same | **153025** | owner card |
| 2026 client contract template (CTR-2026) | same street/office | **153000** | `CONTRACT — 2026 TEMPLATE` |
| Live CS-Cart legal HTML | not used as index authority this cycle | n/a | legacy public |

```text
POSTAL_INDEX_RECONCILIATION_REQUIRED
153025 = company card / current seller source for the new site
153000 = 2026 contract template
Do not invent a third index.
Do not silently rewrite the Word template postal code in this cycle.
```

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
| CTI-P0-01 | P0 | Warranty **18** months vs owner-approved **12** (`OD-04 = B`) | instruction in §2; gate stays open until Word is edited |
| CTI-P0-02 | P0 | Returns §5.10 + PP 55 (1998) as furniture non-return rule | do not publish; legal review; keep OD-03 = B nuance |
| CTI-P0-03 | P0 | Postal `153000` vs owner card `153025` | `POSTAL_INDEX_RECONCILIATION_REQUIRED` |
| CTI-P1-01 | P1 | Warranty claim **5 working days** vs dispute **5 calendar days** | keep both as provenance; no public SLA |
| CTI-P1-02 | P1 | DIY delivery/lift/assembly vs warranty - must keep manufacturing-defect exception | do not broaden |
| CTI-P1-03 | P1 | Natural-material sentence can be over-read as a blanket defect waiver | keep SoT narrow wording |
| CTI-P1-04 | P1 | Live oferta annex = manufacturer 18 months vs dogovor/template = seller 18 months (obligor) | `WARRANTY_OBLIGOR_LEGAL_WORDING = LEGAL REVIEW`; OD-04 does not close it |
| CTI-P1-05 | P1 | Obsolete legal reference PP 55 | `DO NOT PUBLISH AS-IS` |
| CTI-P2-01 | P2 | Delivery clause numbering restarts after `3.1.4` at `3.1.1` (known CTR-2026 extract) | editorial; no rewrite this cycle |
| CTI-P2-02 | P2 | `Счет-заказ` / `Счёт-заказ` spelling mix in the family of texts | editorial |
| CTI-P2-03 | P2 | Live dogovor care URL still `wdrt.ru` | legacy HTML; not Word-edit this cycle |

Delivery/payment **tariffs and cashier wording** are intentional website divergence (`OD-02`, `OD-05`), not drafting typos.

---

## 10. Legal pack status after this cycle

| Item | Status |
| --- | --- |
| Website commercial warranty term | **12 months** - already `OD-04 = B` |
| Controlled Word amendment for that term | **this file** - ready for the person who edits the template |
| Actual 2026 Word source | **still 18 months** (not in git; not edited here) |
| 12/18 consistency gate | **still open** |
| Warranty start in template | preserve transfer |
| Postal index | **open** owner/data gate |
| Returns SOP | **open** (`OD-03 = B` model only) |
| Public claims SLA | **must not add** (`OD-06B`) |
| Full legal pack token | `OWNER_LEGAL_CONTENT_APPROVED` **not** issued |
| Live CS-Cart | untouched; separate cutover |
| Storefront / runtime / deploy | untouched |

Do not treat writing this Markdown as reconciliation of the customer contract.
