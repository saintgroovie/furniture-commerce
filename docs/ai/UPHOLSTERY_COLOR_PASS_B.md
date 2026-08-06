# Upholstery / color normalization — PASS B

## Owner decision
`OWNER_REJECTED_PUBLIC_DEMO_0CC296E_REPAIRS_REQUIRED` (PASS A accepted; PASS B+ open)

## Code
- `apps/backend/src/lib/upholstery-color-normalization.ts` — canonical normalize + data-plan validator
- Wired into `buildIntraProductExecutionSelectors` (in-memory only; no DB writes)
- Spelling: storage key `lillian`, display `Lilian`; alias `lilian`

## Contract
- Do not invent colors
- Do not treat finish paint as upholstery
- Fabric-family keys are not catalog card axes (PASS A retained)
- Soft + finish family keys → rebucket to fabric for selectors; data apply separate
- PASS B.1: PDP uses one «Обивка» axis for Oliver fabric families (text chips); never per-family `separateFabricRows` / product-thumbnail swatches

## Data apply
Evidence `data-plan/EXACT-PUBLIC-DEMO-UPHOLSTERY-DATA-REPAIR.md` — **not applied** in this PR.
