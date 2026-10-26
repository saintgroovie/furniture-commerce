import assert from "node:assert/strict"
import { getEditorialProducts, resolveEditorialProducts } from "./editorial-shopping-data"

function product(handle: string, price = 100.25): Record<string, unknown> {
  return {
    id: `prod_${handle}`, handle, status: "published", title: "Тестовый стол",
    thumbnail: "/static/products/oliver/test.jpg",
    product_classification: { product_type: "CONFIGURABLE" },
    metadata: { collection: "oliver-kids", buyer_default_configuration: { variant_id: "variant_test", min_unit_price: price } },
    variants: [{ id: "variant_test", prices: [{ currency_code: "rub", amount: price }] }],
  }
}

async function main() {
  const valid = product("ol-81-1")
  assert.ok(resolveEditorialProducts([valid], ["ol-81-1"])["ol-81-1"])
  assert.deepEqual(resolveEditorialProducts([{ ...valid, status: "draft" }], ["ol-81-1"]), {})
  assert.deepEqual(resolveEditorialProducts([valid], ["ol-82-1"]), {})
  assert.deepEqual(resolveEditorialProducts([valid, { ...valid, id: "other" }], ["ol-81-1"]), {})
  assert.deepEqual(resolveEditorialProducts([{ ...valid, metadata: { collection: "provence" } }], ["ol-81-1"]), {})
  const quote = { ...valid, product_sales_policy: { sales_mode: "quote_required" } }
  assert.equal(resolveEditorialProducts([quote], ["ol-81-1"])["ol-81-1"]?.actionLabel, "Обсудить проект")
  assert.equal(resolveEditorialProducts([{ ...valid, product_classification: { product_type: "BESPOKE" } }], ["ol-81-1"])["ol-81-1"]?.actionLabel, "Обсудить проект")

  const fetchBefore = globalThis.fetch, backendBefore = process.env.MEDUSA_BACKEND_INTERNAL_URL
  process.env.MEDUSA_BACKEND_INTERNAL_URL = "http://editorial-fixture.invalid"
  let currentPrice = 100.25
  const calls: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, "/store/catalog-products")
    assert.equal(init?.cache, "no-store")
    const handle = url.searchParams.get("handle")
    assert.ok(handle, "An editorial hotspot must never request the entire catalog")
    calls.push(handle)
    return Response.json({ products: [product(handle, currentPrice), { ...product(handle), status: "draft" }, product("unrequested")] })
  }
  try {
    assert.deepEqual(await getEditorialProducts([]), {})
    assert.equal(calls.length, 0)
    const first = await getEditorialProducts(["ol-81-1", "ol-81-1"])
    assert.equal(calls.length, 1, "Repeated scene handles share one scoped read")
    assert.equal(first["ol-81-1"]?.priceLabel, "от 100,25 ₽")
    assert.equal(first["ol-81-1"]?.href, "/product/prod_ol-81-1")
    currentPrice = 228.75
    const refreshed = await getEditorialProducts(["ol-81-1"])
    assert.equal(refreshed["ol-81-1"]?.priceLabel, "от 228,75 ₽", "A new render uses the edited backend price")
    globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status: 503 })
    assert.deepEqual(await getEditorialProducts(["ol-81-1"]), {}, "An API error never resurrects a stale prototype price")
  } finally {
    globalThis.fetch = fetchBefore
    if (backendBefore === undefined) delete process.env.MEDUSA_BACKEND_INTERNAL_URL
    else process.env.MEDUSA_BACKEND_INTERNAL_URL = backendBefore
  }
  console.log("editorial-shopping-data.fidelity.test.ts: passed")
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
