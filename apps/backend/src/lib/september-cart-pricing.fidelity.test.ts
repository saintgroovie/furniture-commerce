import { parseMaterialTiers } from "./material-tier-contract"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"
import { verifiedProvencePrices } from "./verified-september-catalog"
import { resolveDefaultBuyerConfiguration } from "./default-buyer-configuration"

// Exercise the actual route with its real pricing/metadata helpers. Replace only
// workflow persistence and query transport, so no cart or order is written.
const routeUrl = new URL("../api/store/carts/[id]/line-items/route.ts", import.meta.url)
const routeRequire = createRequire(routeUrl)
let added: Record<string, any> | null = null
const exports: Record<string, any> = {}
const code = ts.transpileModule(readFileSync(routeUrl, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
vm.runInNewContext(code, { exports, require(name: string) {
  if (name === "@medusajs/core-flows") return { addToCartWorkflow: () => ({ run: async (args: any) => { added = args.input.items[0] } }) }
  if (name === "@medusajs/framework/utils") return { QueryContext: (value: any) => value }
  return routeRequire(name)
}}, { filename: fileURLToPath(routeUrl) })

async function check(sku: string, base: number, finish: string, expected: number | null, status = 200, variantId = "test-variant") {
  added = null
  const meta = { workbook_row_key: `provence:${sku}`, finish_color_executions: [
    { key: "cream", label: "Молочный" }, { key: "wood", label: "Тёмное дерево" },
  ], material_tiers: { solid_full: { key: "solid_full", label_ru: "Массив", position: 1, price_multiplier: 1 } } }
  const variant = { id: variantId, sku, product: { metadata: meta }, calculated_price: { calculated_amount: base }, prices: [{ amount: base, currency_code: "rub" }] }
  const query = { graph: async ({ entity }: { entity: string }) => ({ data: entity === "variant"
    ? [variant] : [{ id: "test-cart", currency_code: "rub", region_id: "test-region" }] }) }
  const req = { params: { id: "test-cart" }, body: { variant_id: variantId, quantity: 1,
    metadata: { finish_execution_key: finish, resolved_unit_price: 1, material_price_multiplier: 0.01, finish_color_multiplier: 0.01 } },
    scope: { resolve: () => query } }
  let responseStatus = 0
  const res = { status(n: number) { responseStatus = n; return this }, json(_body: unknown) {} }
  await exports.POST(req, res)
  assert.equal(responseStatus, status)
  if (expected == null) assert.equal(added, null)
  else {
    const item = added as Record<string, any> | null
    assert.ok(item)
    assert.equal(item.unit_price, expected)
    assert.equal(item.metadata.resolved_unit_price, expected, "never trust client price")
    if (variantId !== "test-variant") {
      assert.equal(resolveDefaultBuyerConfiguration({ variants: [variant], metadata: meta })?.min_unit_price, expected)
    }
    if (finish) assert.equal(item.metadata.finish_execution_label, finish === "wood" ? "Тёмное дерево" : "Молочный")
  }
}

void (async () => {
  for (const [sku, base] of [["PV-05-2",66600],["PV-06-2",47300],["PV-08-2",23300],["PV-09-1",13600],
    ["PV-55-1",19900],["PV-62-1",82100],["PV-61-1",122100],["PV-42-2",47800],["PV-65-8",83000]] as const) {
    const prices = verifiedProvencePrices(sku, base)!
    await check(sku, base, "cream", prices.cream)
    await check(sku, base, "wood", prices.wood)
  }
  await check("PV-55-1", 19900, "forged-finish", null, 400)
  await check("PV-55-1", 20000, "wood", null, 409)
  for (const [id, sku, base, price] of [["variant_01KV69A7H4QG73VV860W96G182", "av-05-1", 83820, 87780], ["variant_01KV69A7H410GASW313SSMWF4E", "ba-05-3", 113080, 124300], ["variant_01KV69A7H6QSCESM5YZW3FBVRT", "in-67-1", 85250, 85250], ["variant_01KV69A7H5G52SZGAW6YR5PK7T", "fa-06-1", 59730, 62700], ["variant_01KV69A7H6T0M8VR6SH10PKG79", "fk-05-1", 83820, 87780], ["variant_01KV69A7H8R6FSAA3JGFT02PMK", "rl-67-1", 85250, 85250], ["variant_01KV69A7H5CMMHYFNHKXQJWE5N", "fa-67-1", 85250, 85250], ["variant_01KV69A7H8D09CRXQG8HQ1DDN5", "rl-05-3", 113080, 113080], ["variant_01KV69A7H75NQCJC0A66PE0PR5", "mo-81-1", 22660, 22660], ["variant_01KV69A7H7GT4WF22X1ZWBH0SZ", "pa-05-1", 83820, 96360], ["variant_01KV69A7H48XE5C7YE56RBRDKP", "ba-62-1", 99390, 100320], ["variant_01KV69A7HAR5G3HAQ2M1CYR2VM", "te-05-3", 113080, 124300], ["variant_01KV69A7H9NA9PDPJBT2H5P929", "tb-67-1", 85250, 85250], ["variant_01KV69A7H8QXV0PCF7SHYJRQ1M", "sh-81-1", 22660, 22660]] as const) {
    await check(sku, base, "", price, 200, id)
    await check(sku, base + 1, "", null, 409, id)
  }
  console.log("september-cart-pricing.fidelity.test.ts: 48 route cases passed")
})().catch((error) => { console.error(error); process.exitCode = 1 })

for (const [legacy, full, ldsp] of [["MN-05-2", 98670, 75800], ["MN-08-1", 27060, 22900], ["MN-61-1", 167090, 125450]] as const) {
  const metadata = { collection: "monchelsea", woodright_recovery: { legacy_code: legacy }, material_tiers: {
    solid_full: { key: "solid_full", label_ru: "Массив", description_ru: "", price_rub: full, price_multiplier: 1, position: 1 },
    solid_front_ldsp_body: { key: "solid_front_ldsp_body", label_ru: "Фасады из массива + корпус ЛДСП", description_ru: "Массив", price_rub: ldsp, price_multiplier: ldsp / full, position: 0 },
  } }
  assert.equal(parseMaterialTiers(metadata)![0].label_ru, "ЛДСП + МДФ")
  const product = { metadata, variants: [{ id: "test-mnm", prices: [{ amount: full, currency_code: "rub" }] }] }
  const result = resolveDefaultBuyerConfiguration(product)!
  assert.equal(result.material_execution_label, "ЛДСП + МДФ")
  assert.equal(result.min_unit_price, ldsp)
}
