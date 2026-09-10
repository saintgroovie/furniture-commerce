# Upholstery / color normalization — PASS B + PASS C

## Owner decision
`OWNER_REJECTED_PUBLIC_DEMO_0CC296E_REPAIRS_REQUIRED` (PASS A accepted; PASS B+ open)

## Code
- `apps/backend/src/lib/upholstery-color-normalization.ts` — canonical normalize + data-plan validator
- `apps/backend/src/lib/option-presentation-contract.ts` — PASS C presentation semantics
- Wired into `buildIntraProductExecutionSelectors` (in-memory only; no DB writes)
- Spelling: storage key `lillian`, display `Lilian`; alias `lilian`

## Contract
- Do not invent colors
- Do not invent fabric texture images
- Do not treat finish paint as upholstery
- Fabric-family keys are not catalog card axes (PASS A retained)
- Soft + finish family keys → rebucket to fabric for selectors; data apply separate
- PASS B.1: PDP uses one «Обивка» axis for Oliver fabric families; never per-family `separateFabricRows` / product-thumbnail swatches
- PASS C: when metadata has evidenced `swatch_hex`, render **color swatches** on that single Обивка axis; when `swatch_image` (texture) exists, render image swatches; otherwise text chips. Execution `urls` / `mainSrc` remain gallery heroes, not swatch tiles.

## Presentation field (read-model)
```text
presentation: swatch_image | swatch_color | text | model | material | size
swatch_image: confirmed texture URL only
swatch_hex: confirmed color sample
```

## Data apply
Evidence `data-plan/EXACT-PUBLIC-DEMO-UPHOLSTERY-DATA-REPAIR.md` — **not applied** in this PR.

## Audit tooling
```sh
DATABASE_URL=… python3 scripts/catalog/catalog-options-audit.py --json-out tmp/catalog-options-audit --label BEFORE
```
