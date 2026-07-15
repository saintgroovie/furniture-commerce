# Test results

## Unit: configured-line-item-pricing
```
TAP version 13
# configured-line-item-pricing.test.ts: ok
# Subtest: resolveMaterialTierPrice / resolveConfiguredUnitPrice
    # Subtest: LDSP is round(base × 0.7)
    ok 1 - LDSP is round(base × 0.7)
      ---
      duration_ms: 0.984048
      type: 'test'
      ...
    # Subtest: full solid is base
    ok 2 - full solid is base
      ---
      duration_ms: 0.142992
      type: 'test'
      ...
    # Subtest: rounds once after material × color (formula is single Math.round)
    ok 3 - rounds once after material × color (formula is single Math.round)
      ---
      duration_ms: 0.191654
      type: 'test'
      ...
    1..3
ok 1 - resolveMaterialTierPrice / resolveConfiguredUnitPrice
  ---
  duration_ms: 2.413127
  type: 'suite'
  ...
# Subtest: resolveFinishColorMultiplier
    # Subtest: standard finish → 1, premium → 1.05
    ok 1 - standard finish → 1, premium → 1.05
      ---
      duration_ms: 0.355476
      type: 'test'
      ...
    1..1
ok 2 - resolveFinishColorMultiplier
  ---
  duration_ms: 0.477264
  type: 'suite'
  ...
# Subtest: resolveConfiguredLineItemPricing — B1 / A1 / metadata rewrite
    # Subtest: B1: missing material code when tiers exist → MATERIAL_EXECUTION_REQUIRED
    ok 1 - B1: missing material code when tiers exist → MATERIAL_EXECUTION_REQUIRED
      ---
      duration_ms: 0.543573
      type: 'test'
      ...
    # Subtest: A1: missing calculated_price on configured path → VARIANT_PRICE_NOT_FOUND
    ok 2 - A1: missing calculated_price on configured path → VARIANT_PRICE_NOT_FOUND
      ---
      duration_ms: 0.237925
      type: 'test'
      ...
    # Subtest: unknown material code → UNKNOWN_MATERIAL_EXECUTION
    ok 3 - unknown material code → UNKNOWN_MATERIAL_EXECUTION
      ---
      duration_ms: 0.289239
      type: 'test'
      ...
    # Subtest: unknown finish key → UNKNOWN_FINISH_EXECUTION
    ok 4 - unknown finish key → UNKNOWN_FINISH_EXECUTION
      ---
      duration_ms: 0.239933
      type: 'test'
      ...
    # Subtest: rewrites client-forged labels/multipliers/resolved and pins LDSP unit_price
    ok 5 - rewrites client-forged labels/multipliers/resolved and pins LDSP unit_price
      ---
      duration_ms: 0.243446
      type: 'test'
      ...
    # Subtest: LDSP + premium finish applies both multipliers once
    ok 6 - LDSP + premium finish applies both multipliers once
      ---
      duration_ms: 0.46471
      type: 'test'
      ...
    # Subtest: full solid + standard finish: resolved=base, no custom unit_price pin
    ok 7 - full solid + standard finish: resolved=base, no custom unit_price pin
      ---
      duration_ms: 0.144796
      type: 'test'
      ...
    # Subtest: product without tiers and without finish → default Medusa path
    ok 8 - product without tiers and without finish → default Medusa path
      ---
      duration_ms: 0.121299
      type: 'test'
      ...
    1..8
ok 3 - resolveConfiguredLineItemPricing — B1 / A1 / metadata rewrite
  ---
  duration_ms: 2.629684
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
# duration_ms 363.426813
```

- unit exit: `0`

## E2E: material-execution-pricing
```
{"check":"health_storefront","pass":true,"detail":{"status":200}}
{"check":"health_backend","pass":true,"detail":{"status":200}}
{"check":"api_publishable_key","pass":true,"detail":{"len":67}}
{"check":"api_product_with_tiers","pass":true,"detail":{"handle":"greenwich-gr-05-1"}}
{"check":"api_B1_material_required","pass":true,"detail":{"status":400,"code":"MATERIAL_EXECUTION_REQUIRED"}}
{"check":"api_unknown_material","pass":true,"detail":{"status":400,"code":"UNKNOWN_MATERIAL_EXECUTION"}}
{"check":"api_full_solid","pass":true,"detail":{"base":109500}}
{"check":"api_ldsp_price_and_rewrite","pass":true,"detail":{"unit":76650,"expectedLdsp":76650,"label":"Фасады из массива + корпус ЛДСП"}}
{"check":"api_qty2_unit_once","pass":true,"detail":{"qty":2,"unit":76650,"expectedLdsp":76650,"resolved":76650}}
{"check":"api_ldsp_premium_finish","pass":true,"detail":{"handle":"greenwich-gr-05-1","prem":"graphite","unit":80483,"expectedPrem":80483,"color_mult":1.05}}
{"check":"ui_dropdown_visible","pass":true,"detail":null}
{"check":"ui_combobox_role","pass":true,"detail":{"role":"combobox"}}
{"check":"ui_default_ldsp","pass":true,"detail":{"text":"ИСПОЛНЕНИЕ Фасады из массива + корпус ЛДСП 76 650 ₽"}}
{"check":"ui_open_enter","pass":true,"detail":null}
{"check":"ui_two_options","pass":true,"detail":{"optCount":2}}
{"check":"ui_aria_activedescendant","pass":true,"detail":null}
{"check":"ui_select_full_solid","pass":true,"detail":{"text":"ИСПОЛНЕНИЕ Полностью из массива 109 500 ₽"}}
{"check":"ui_escape_closes","pass":true,"detail":null}
{"check":"ui_cart_execution_label","pass":true,"detail":{"snippet":"Корзина Проверьте состав, исполнение и количество Оформление займёт пару минут понадобятся контакты и адрес Состав заказа Убедитесь, что всё верно изменить состав после оформления можно через менеджера WOODRIGHT Комод Исполнение: Фасады из массива + корпус ЛДСП · Цвет: Белый G503"}}
{"check":"ui_bespoke_material_query","pass":true,"detail":null}
{"check":"ui_bespoke_form","pass":true,"detail":null}
{"check":"ui_responsive_1440","pass":true,"detail":{"scrollWidth":1440,"clientWidth":1440}}
{"check":"ui_responsive_768","pass":true,"detail":{"scrollWidth":768,"clientWidth":768}}
{"check":"ui_responsive_390","pass":true,"detail":{"scrollWidth":390,"clientWidth":390}}
{"check":"ui_responsive_320","pass":true,"detail":{"scrollWidth":320,"clientWidth":320}}
{"summary":{"total":25,"failed":0,"failedNames":[],"artifactDir":"/Users/leonidmbp/Documents/projects/furniture-commerce/docs/reports/material-execution-pricing/runs/20260715T183706Z/e2e","product":"greenwich-gr-05-1","store":"http://127.0.0.1:3002","backend":"http://127.0.0.1:9000","at":"2026-07-15T18:37:28.745Z"}}
```

- e2e exit: `0`
