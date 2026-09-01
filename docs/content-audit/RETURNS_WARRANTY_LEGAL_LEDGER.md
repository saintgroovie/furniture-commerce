# Returns & warranty legal source ledger

**Role:** supporting verification. Not a second commercial SoT. Not buyer-facing copy.
**Verified:** 2026-09-01 (Europe/Moscow).
**Statute edition used:** Закон РФ от 07.02.1992 N 2300-1 (ред. от 28.12.2025, с изм. от 17.02.2026).
**Consultant HTML:** HTTP 500 this cycle; article bodies from Klerk statute mirror; PP 2463 list from Garant; КС 7-П from Российская газета 12.03.2026.

Canonical policy: `docs/owner/returns-sop.md`, `docs/owner/warranty-public-policy.md`.
Website SoT: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md`.

SEO blogs / `pravopotreb.ru` are **not** authority.

| Issue | Current rule | Authority | Source date | Confidence | Public implication |
| --- | --- | --- | --- | --- | --- |
| Remote refuse before transfer | Anytime | ЗоЗПП ст. 26.1 п. 4 | statute 2026 | high | Disclose as law |
| Remote good-quality after transfer | 7 days if written return info at delivery | ст. 26.1 п. 4 | statute 2026 | high | Not a Woodright extra window |
| No written return info | 3 months from transfer | ст. 26.1 п. 4 | statute 2026 | high | Ops: give written info |
| Remote good-quality condition | Appearance + consumer properties | ст. 26.1 п. 4 | statute 2026 | high | Not defect path |
| Proof of purchase (remote) | Other evidence allowed | ст. 26.1 п. 4 | statute 2026 | high | No cheque-only bar |
| Individually-determined | Two limbs: individual properties **and** exclusive use by this consumer | ст. 26.1 п. 4 | statute 2026 | high | Label ≠ exception |
| Remote refund timing | 10 days from demand, minus return-shipping **from** consumer | ст. 26.1 п. 4 | statute 2026 | high | `LEGAL OBLIGATION` |
| Remote defects | ст. 18–24, not the 7-day window | ст. 26.1 п. 5 | statute 2026 | high | Separate SOP branch |
| Remote return **method** (interim) | Buyer-chosen method that allows seller inspection, incl. post/courier; buyer pays transport + bears transit risk | КС РФ 17.02.2026 N 7-П §2 | RG 12.03.2026 | high as KS | Not «only visit us» |
| KS 7-П scope | п. 3–4 of 26.1 unconstitutional **insofar as they omit remote return**; 7-day / exception text not deleted | same | 2026 | high | Do not treat 26.1 as void |
| Offline good-quality exchange | 14 days excl. purchase day; unused; analogue or money | ЗоЗПП ст. 25 | statute | high | Not remote policy |
| Furniture-set list | «Мебельные гарнитуры бытового назначения» not exchangeable under the list | ПП РФ 31.12.2020 N 2463 перечень п. 8 (Garant) | 2020/2024 | high as text | Not all furniture; not remote override |
| List vs remote | List **not** applied to remote sale | Consultant note on that list → Информация Роспотребнадзора | cited 2026-08-17; reconfirmed 2026-09-01 | high as official note | Do not refuse site orders via п. 8 |
| PP 55 (1998) | Lost force **01.01.2021**; replaced by PP 2463 | PP 2463 in force 01.01.2021 | 2021 | high | `SUPERSEDED / NOT CURRENT PUBLIC AUTHORITY` |
| Defect remedies | Consumer **choice**: replace, reduce price, repair / reimburse, refuse + money | ст. 18 п. 1 | statute 2026 | high | Seller is not sole chooser |
| No cheque (defects) | Not a refuse ground | ст. 18 п. 5 | statute 2026 | high | Same as SOP |
| Quality check / expertise | Seller accepts + may inspect; expertise at seller cost in cause dispute | ст. 18 п. 5 | statute 2026 | high | Photos optional |
| Burden during warranty | Seller proves consumer / third party / force majeure | ст. 18 п. 6 | statute 2026 | high | Copy must not invert |
| Large goods | Seller pays delivery >5 kg / bulky for repair, markdown, replace, return | ст. 18 п. 7 | statute 2026 | high | Ops, not SLA |
| Defect price refund | 10 days from demand | ст. 22 | statute | high | `LEGAL OBLIGATION` |
| Commercial warranty | Seller **may** set; Woodright **did** (12 months) | ст. 5 п. 6–7 + OD-04 = B | 2026 | high | Term owner-set |
| Warranty start | Generally from transfer | ст. 19 п. 2 + CTR-2026 | 2026 | high | Public start OK |
| After short warranty | Claims within 2 years if consumer proves pre-transfer cause | ст. 19 п. 5; ГК ст. 477 п. 5 | statute | high | No «после 12 месяцев нельзя» |
| Terms worsening rights | Invalid | ст. 16 | statute | high | No blanket voids |
| Contract 5 working / 5 calendar | Paper deadlines; mutually inconsistent | CTR-2026 | 2026 template | high as text | Provenance only; `OD-06B` |
| Live 18 months / manufacturer | Stale public HTML | woodright.ru `/oferta/` `/dogovor-postavki/` | probed 2026-08-19 | high as published | Legacy; not new-site SoT |

## Buyer-facing divergences (read-only; no code this cycle)

Canonical `apps/storefront` on this branch. Implementation is a **later** cycle.

| Path | Current wording | Required semantic correction | Severity |
| --- | --- | --- | --- |
| `legal-content.ts` `/warranty` | «Гарантия Woodright - 12 месяцев»; no start; no seller | Add start from transfer; seller ООО «Роэл-Техник»; manufacturing-defect scope; statutory disclaimer; DIY/natural-material narrow lines from warranty spec | P1 |
| `woodright-copy.ts` `warranty` SEO | 12 months + statutory rights; no start / obligor | Align with spec when `/warranty` ships | P2 |
| `legal-content.ts` `/offer` warranty | «Гарантия Woodright - 12 месяцев» | Same start / seller / statutory line | P2 |
| `legal-content.ts` `/returns` | Manager-assisted; no 7/3-month **disclosure**; cautious individual-params line | Keep OD-03 tone; optional later statutory disclosure (not a Woodright tariff); never Demo/14/PP55 | P2 |
| Footer `/returns` `/warranty` | Links exist; routes may still be missing on primary dirty tree | Implement from SOP + spec; do not invent email | P2 |
| Live `https://woodright.ru/vozvrat/` | 14 days + Demo Magazin + PP 55 | Unpublish / replace; not this repo | P0 live |
| Live `/oferta/` | 18 months **производитель**; bank block | Legacy; 12 months seller | P0 live |
| Live `/dogovor-postavki/` | 18 months seller; PP 55 lineage | Legacy vs current Word 12 months / 153025 | P0 live |
| Live `/oplata-i-dostavka/` | Card / QR / installment | Conflicts `OD-05` | P0 live |
