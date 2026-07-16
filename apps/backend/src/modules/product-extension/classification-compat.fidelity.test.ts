/**
 * ProductClassification identity + Date-model defaults contract.
 *
 * Run from apps/backend:
 *   node_modules/.bin/tsx src/modules/product-extension/classification-compat.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(process.cwd(), "src")

const dateModels = [
  "modules/bespoke-request/models/bespoke-request.ts",
  "modules/lead/models/lead.ts",
  "modules/payment-link/models/payment-link.ts",
  "modules/room-set/models/room-set.ts",
  "modules/room-set/models/room-set-item.ts",
]

for (const rel of dateModels) {
  const src = readFileSync(join(root, rel), "utf8")
  assert.doesNotMatch(
    src,
    /\.default\(\s*\(\)\s*=>\s*new Date\(\)\s*\)/,
    `${rel} must not use Date function defaults (Medusa 2.17 model API)`
  )
}

const model = readFileSync(
  join(root, "modules/product-extension/models/product-type.ts"),
  "utf8"
)
assert.match(model, /ProductClassification/)
assert.match(model, /"product_classification"/)
assert.match(
  model,
  /product_type:\s*model\.enum\(\["STANDARD",\s*"CONFIGURABLE",\s*"BESPOKE"\]\)/
)

console.log("classification-compat.fidelity.test.ts: ok")
