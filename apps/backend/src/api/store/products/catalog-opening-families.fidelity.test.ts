/**
 * Every multi-SKU family opens on the same SKU in the full graph and in
 * the catalog browse slim. Explicit SKU prices stay on that SKU.
 *
 *   node_modules/.bin/tsx src/api/store/products/catalog-opening-families.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveDefaultBuyerConfiguration } from "../../../lib/default-buyer-configuration"
import { slimBrowseVariantRecord } from "./load-store-product-list"

type Axis = Record<string, { sort?: number; label?: string; display?: string }>
type FixtureVariant = {
  id: string
  sku: string
  calculated_amount: number
  variant_axes: Axis | null
  material_tiers: Record<string, unknown> | null
}
type FixtureFamily = {
  family: string
  handle: string
  title: string
  product_id: string
  material_tiers: Record<string, unknown> | null
  variants: FixtureVariant[]
}

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "catalog-opening-families.fixture.json"),
    "utf8"
  )
) as FixtureFamily[]

function asVariant(row: FixtureVariant): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  if (row.variant_axes) metadata.variant_axes = row.variant_axes
  if (row.material_tiers) metadata.capabilities = { material_tiers: row.material_tiers }
  return {
    id: row.id,
    sku: row.sku,
    calculated_price: {
      calculated_amount: row.calculated_amount,
      original_amount: row.calculated_amount,
      currency_code: "rub",
    },
    metadata,
  }
}

function asProduct(family: FixtureFamily, variants: FixtureVariant[]) {
  return {
    id: family.product_id,
    handle: family.handle,
    title: family.title,
    metadata: family.material_tiers ? { material_tiers: family.material_tiers } : {},
    variants: variants.map(asVariant),
  }
}

assert.equal(fixture.length, 28)
assert.equal(fixture.reduce((sum, family) => sum + family.variants.length, 0), 77)

let openingMismatch = 0
for (const family of fixture) {
  const full = resolveDefaultBuyerConfiguration(asProduct(family, family.variants))
  const browse = resolveDefaultBuyerConfiguration({
    ...asProduct(family, family.variants),
    variants: family.variants.map((row) => slimBrowseVariantRecord(asVariant(row))),
  })
  if (!full || !browse || full.variant_id !== browse.variant_id || full.min_unit_price !== browse.min_unit_price) {
    openingMismatch += 1
    console.error(family.handle, full?.variant_id, browse?.variant_id, full?.min_unit_price, browse?.min_unit_price)
  }
}
assert.equal(openingMismatch, 0)

function buyer(sku: string): { sku: string; price: number } {
  for (const family of fixture) {
    const row = family.variants.find((variant) => variant.sku === sku)
    if (!row) continue
    const resolved = resolveDefaultBuyerConfiguration(asProduct(family, [row]))
    assert.ok(resolved, sku)
    return { sku, price: resolved.min_unit_price }
  }
  throw new Error(`missing ${sku}`)
}

const expected: Record<string, number> = {
  "OL-14-2": 48_930,
  "OL-14-1": 51_030,
  "OL-15-1": 64_330,
  "OL-17-1": 94_430,
  "OL-17-3": 109_830,
  "GR-09-1": 50_330,
  "GR-18-1": 77_280,
  "CO-14-2": 35_070,
  "CO-15-2": 43_400,
  "PV-15-2": 49_210,
}
for (const [sku, price] of Object.entries(expected)) {
  assert.equal(buyer(sku).price, price, sku)
}

const oliver = fixture.find((family) => family.handle === "ol-14-1")
assert.ok(oliver)
const oliverOpening = resolveDefaultBuyerConfiguration(asProduct(oliver, oliver.variants))
assert.equal(
  oliver.variants.find((variant) => variant.id === oliverOpening?.variant_id)?.sku,
  "OL-14-2"
)
assert.equal(oliverOpening?.min_unit_price, 48_930)

console.log("catalog-opening-families.fidelity.test.ts: ok")
