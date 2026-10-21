import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"
import { verifiedProvencePrices } from "./verified-september-catalog"

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

async function check(sku: string, base: number, finish: string, expected: number | null, status = 200) {
  added = null
  const meta = { workbook_row_key: `provence:${sku}`, finish_color_executions: [
    { key: "cream", label: "Молочный" }, { key: "wood", label: "Тёмное дерево" },
  ], material_tiers: { solid_full: { key: "solid_full", label_ru: "Массив", position: 1, price_multiplier: 1 } } }
  const variant = { product: { metadata: meta }, calculated_price: { calculated_amount: base }, prices: [{ amount: base, currency_code: "rub" }] }
  const query = { graph: async ({ entity }: { entity: string }) => ({ data: entity === "variant"
    ? [variant] : [{ id: "test-cart", currency_code: "rub", region_id: "test-region" }] }) }
  const req = { params: { id: "test-cart" }, body: { variant_id: "test-variant", quantity: 1,
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
    assert.equal(item.metadata.finish_execution_label, finish === "wood" ? "Тёмное дерево" : "Молочный")
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
  console.log("september-cart-pricing.fidelity.test.ts: 20 route cases passed")
})().catch((error) => { console.error(error); process.exitCode = 1 })
