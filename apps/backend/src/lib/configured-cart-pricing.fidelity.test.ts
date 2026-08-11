import assert from "node:assert/strict"
import { parseMaterialTiers, findMaterialTier } from "./material-tier-contract"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "./finish-color-premium-contract"

const meta = {
  material_tiers: {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "Фасады из массива + корпус ЛДСП",
      price_multiplier: 0.7,
      position: 0,
    },
    solid_full: {
      key: "solid_full",
      label_ru: "Полностью массив",
      price_multiplier: 1,
      position: 1,
    },
  },
  finish_color_labels: { milk: "Молочный", graphite: "Графит" },
  paint_finish_executions: [{ key: "milk" }, { key: "graphite" }],
}

const tiers = parseMaterialTiers(meta)
assert.ok(tiers)
assert.equal(tiers![0]!.key, "solid_front_ldsp_body")
assert.equal(findMaterialTier(tiers!, "solid_full")?.price_multiplier, 1)

const base = 100000
assert.equal(resolveConfiguredUnitPrice(base, 0.7, 1), 70000)
assert.equal(resolveConfiguredUnitPrice(base, 1, 1.05), 105000)
assert.equal(resolveFinishColorMultiplier(meta, "milk"), 1)
assert.equal(resolveFinishColorMultiplier(meta, "graphite"), 1.05)

console.log("configured-cart-pricing.fidelity.test.ts: ok")
