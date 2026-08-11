/**
 * Cart line identity: two configurations of the same variant must not collapse
 * to the same identity key (product id alone is insufficient).
 *
 *   yarn --cwd apps/storefront exec tsx src/lib/cart-line-identity.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { cartLineConfigurationIdentity } from "./cart-line-identity"

const base = { variant_id: "var_1", product_id: "prod_1" }
const a = cartLineConfigurationIdentity({
  ...base,
  metadata: {
    material_execution_code: "solid_front_ldsp_body",
    finish_execution_key: "milk",
    execution_specs: [{ label: "Цвет", value: "Молочный" }],
  },
})
const b = cartLineConfigurationIdentity({
  ...base,
  metadata: {
    material_execution_code: "solid_full",
    finish_execution_key: "milk",
    execution_specs: [{ label: "Цвет", value: "Молочный" }],
  },
})
const c = cartLineConfigurationIdentity({
  ...base,
  metadata: {
    material_execution_code: "solid_front_ldsp_body",
    finish_execution_key: "graphite",
    execution_specs: [{ label: "Цвет", value: "Графит" }],
  },
})

assert.notEqual(a, b)
assert.notEqual(a, c)
assert.notEqual(b, c)
assert.equal(
  cartLineConfigurationIdentity({
    ...base,
    metadata: {
      material_execution_code: "solid_front_ldsp_body",
      finish_execution_key: "milk",
      execution_specs: [{ label: "Цвет", value: "Молочный" }],
    },
  }),
  a
)

console.log("cart-line-identity.fidelity.test.ts: ok")
