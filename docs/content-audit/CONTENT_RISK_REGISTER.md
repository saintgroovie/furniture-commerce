# Content risk register

**Supersession 2026-08-20:** R4 checkout «accepts оферта» is **stale**. Current checkout has no offer-acceptance control; OD-06A = submit is a request. See `20260820_LAUNCH_COMPLETION.md`.

| ID | Risk | Severity | Affected | Evidence | Mitigation | Dependency |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Live returns page sends buyers to **Demo Magazin / demostore.ru** | **Critical** (legacy live) | public `/vozvrat/` | curl **2026-08-17** | Never port. `LEGACY PUBLIC DEFECT`. Identity is **not** unresolved (`OD-01 = A`). Unpublish = ops (not this cycle) | Live CMS / cutover |
| R2 | Live site publishes tariffs/warranty that rem refuses; live also shows entity/bank | High | public delivery/oferta vs new stack | CF-01 resolved (`OD-02 = B`); CF-04 commercial window **resolved** (`OD-03 = B`); CF-03 **term resolved** (`OD-04 = B` = 12 months owner-set) | Do **not** port live delivery ₽/%, live bank, live 14 days, live **18 months** | Copy phase `/warranty`; cutover |
| R3 | Conflicting delivery price models (2000 ₽ vs 1%) | High as **live divergence** | legacy+public | CF-01 | **RESOLVED for new site:** neither tariff chosen; quote-only (`OD-02 = B`). Live CS-Cart may still show ₽/% until cutover | Cutover |
| R4 | Offer acceptance / privacy email | Med (launch) | `/offer` `/privacy` | 2026-08-20 re-verify: no checkout «принимаю оферту»; privacy email still MISSING | Submit = request (`OD-06A`); PD contact = seller + address + phones; no invented email | `OWNER_LEGAL_CONTENT_APPROVED` later |
| R5 | Canon `:3002` footer → 404 on legal URLs | High | QA/storefront | curl 404 | Merge rem routes or hide footer links until ready | Engineering |
| R6 | Unsupported / unclear assembly & measurement promises | Med | checkout, bespoke media, about | ASM-002, SVC-001 | Soften copy; OD-08 | Owner + COPY |
| R7 | Bespoke boundary overclaims («под ключ», «любой сложности») | Med | bespoke/footer | BB-*; `BESPOKE_POSITIONING.md` | New Bespoke voice omits these; copy pass later. Proof ≠ current service menu. Do not present Bespoke as a second service vs «По проекту» | OD-08 + COPY |
| R15 | `/bespoke/catalog` reads as a third catalog / unlimited custom shop | Med | `/bespoke/catalog` | BES-003 | **Not default IA.** Do not promote in nav. Leave route until copy phase unless a confirmed product reason appears | Copy phase; no new OD |
| R16 | Blanket «Bespoke / по проекту / обивка = невозврат» in new-site copy | High if published | `/returns` copy phase | RET-010; OD-03 = B | **Forbidden** as unsupported new-site copy. Cases 1–6 stay `LEGAL REVIEW` | Copy + legal |
| R17 | Reverse-logistics arranger / extra goodwill not chosen while `/returns` is still unpublished | Med | production implementation | RET-005; RET-006 | SOP exists (`docs/owner/returns-sop.md`). Do not ship `/returns` as production until copy cycle. Extra goodwill still owner-optional | Implementation cycle |
| R8 | Designers «условия» without commercial terms | Med | `/designers/terms` | inventory | Rename/merge; OD-09 | Owner |
| R9 | Panels claimed without service FAQ | Med | footer | PAN-001 | Soften or add page after OD | Owner |
| R10 | Live CS-Cart card/QR/installment vs new-site PaymentLink | Med-High | trust at cutover | CF-02 resolved for *new SoT* (`OD-05 = A`) | Do not port live payment promises. New-site copy = invoice/PaymentLink only | Cutover / copy phase |
| R11 | Live oferta shows bank details; new site must not | High | live `/oferta/`; future `/requisites` | LEG-002 vs LEG-003; OD-10 = B | Keep new-site public bank = NO. Internal card confirmed. Not a missing-data bug on `/requisites` | Do not publish; accounting/invoice only |
| R12 | Hours/emails drift (public vs SoT) | Med | contacts | CF-05 | OD-07; put in showroom SoT | Owner |
| R13 | MAX URL / maps present in rem, missing in canon | Low | contacts parity | SHOW-* | Sync trees | Engineering |
| R14 | Ops worktree still shows prep/draft legal chrome | Low-Med | wrong checkout confusion | SF-OPS | Prefer rem SoT only | Ops discipline |

## Legal review queue (not «approved»)

1. Final оферта text after OD-06 (acceptance, disputes). Seller identity is confirmed (`OD-01 = A`); do not wait on entity name.
2. Privacy + PD operator rules + **privacy email** (still MISSING).
3. Returns: statutory 26.1 / 18–24 vs Woodright SOP; individually-defined mapping (cases 1–6); KS RF 17.02.2026 N 7-П. Launch **model** closed (`OD-03 = B`); clauses **not** legally approved. Do not port 14 days. Pack: `OD03_RETURNS_VERIFICATION.md`.
4. Warranty **wording** after `OD-04 = B`: start point; seller vs manufacturer / obligor; hardware/mechanisms/upholstery scope; DIY/assembly/humidity voids; service-life 18m leftover. Term itself is owner-set **12 months**. Pack: `OD04_WARRANTY_VERIFICATION.md`. Statutory defect rights are not an owner «off» switch. Live 18 months = `LEGACY PUBLIC DIVERGENCE`.
5. Any installment advertising (consumer credit rules).
6. Removal/replacement of live Demo Magazin instructions.
7. Live CS-Cart bank block vs `NEW_SITE_PUBLIC_BANK_DETAILS = NO` (legacy; not a new-site publish task).

Engineering must not rewrite contracts as a substitute for counsel.
