# Test results

## Unit: configured-line-item-pricing
```
TAP version 13
# configured-line-item-pricing.test.ts: ok
# Subtest: resolveMaterialTierPrice / resolveConfiguredUnitPrice
    # Subtest: LDSP is round(base × 0.7)
    ok 1 - LDSP is round(base × 0.7)
      ---
      duration_ms: 1.067482
      type: 'test'
      ...
    # Subtest: full solid is base
    ok 2 - full solid is base
      ---
      duration_ms: 0.1942
      type: 'test'
      ...
    # Subtest: rounds once after material × color (formula is single Math.round)
    ok 3 - rounds once after material × color (formula is single Math.round)
      ---
      duration_ms: 0.201139
      type: 'test'
      ...
    1..3
ok 1 - resolveMaterialTierPrice / resolveConfiguredUnitPrice
  ---
  duration_ms: 2.774786
  type: 'suite'
  ...
# Subtest: resolveFinishColorMultiplier
    # Subtest: standard finish → 1, premium → 1.05
    ok 1 - standard finish → 1, premium → 1.05
      ---
      duration_ms: 0.402465
      type: 'test'
      ...
    1..1
ok 2 - resolveFinishColorMultiplier
  ---
  duration_ms: 0.537732
  type: 'suite'
  ...
# Subtest: resolveConfiguredLineItemPricing — B1 / A1 / metadata rewrite
    # Subtest: B1: missing material code when tiers exist → MATERIAL_EXECUTION_REQUIRED
    ok 1 - B1: missing material code when tiers exist → MATERIAL_EXECUTION_REQUIRED
      ---
      duration_ms: 0.656298
      type: 'test'
      ...
    # Subtest: A1: missing calculated_price on configured path → VARIANT_PRICE_NOT_FOUND
    ok 2 - A1: missing calculated_price on configured path → VARIANT_PRICE_NOT_FOUND
      ---
      duration_ms: 0.393752
      type: 'test'
      ...
    # Subtest: unknown material code → UNKNOWN_MATERIAL_EXECUTION
    ok 3 - unknown material code → UNKNOWN_MATERIAL_EXECUTION
      ---
      duration_ms: 0.374946
      type: 'test'
      ...
    # Subtest: unknown finish key → UNKNOWN_FINISH_EXECUTION
    ok 4 - unknown finish key → UNKNOWN_FINISH_EXECUTION
      ---
      duration_ms: 0.299499
      type: 'test'
      ...
    # Subtest: rewrites client-forged labels/multipliers/resolved and pins LDSP unit_price
    ok 5 - rewrites client-forged labels/multipliers/resolved and pins LDSP unit_price
      ---
      duration_ms: 0.292269
      type: 'test'
      ...
    # Subtest: LDSP + premium finish applies both multipliers once
    ok 6 - LDSP + premium finish applies both multipliers once
      ---
      duration_ms: 0.527107
      type: 'test'
      ...
    # Subtest: full solid + standard finish: resolved=base, no custom unit_price pin
    ok 7 - full solid + standard finish: resolved=base, no custom unit_price pin
      ---
      duration_ms: 0.181
      type: 'test'
      ...
    # Subtest: product without tiers and without finish → default Medusa path
    ok 8 - product without tiers and without finish → default Medusa path
      ---
      duration_ms: 0.178481
      type: 'test'
      ...
    1..8
ok 3 - resolveConfiguredLineItemPricing — B1 / A1 / metadata rewrite
  ---
  duration_ms: 3.315039
  type: 'suite'
  ...
1..3
# tests 12
# suites 3
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 431.738554
```

- unit exit: `0`

## E2E: material-execution-pricing
```
file:///Users/leonidmbp/iCloud%20Drive%20(%D0%B0%D1%80%D1%85%D0%B8%D0%B2)/Documents/projects/furniture-commerce/apps/storefront/scripts/e2e-material-execution-pricing.mjs:19
const fs = require("fs")
           ^

ReferenceError: require is not defined in ES module scope, you can use import instead
    at file:///Users/leonidmbp/iCloud%20Drive%20(%D0%B0%D1%80%D1%85%D0%B8%D0%B2)/Documents/projects/furniture-commerce/apps/storefront/scripts/e2e-material-execution-pricing.mjs:19:12
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:665:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)

Node.js v22.22.2
```

- e2e exit: `1`
