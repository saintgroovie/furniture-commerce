/**
 * node_modules/.bin/tsx src/api/store/catalog-products/coalesce-browse-catalog.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  browseCatalogCoalesceKey,
  coalesceBrowseCatalog,
  resetBrowseCatalogCoalesceForTests,
} from "./coalesce-browse-catalog"

resetBrowseCatalogCoalesceForTests()

assert.equal(browseCatalogCoalesceKey({}), "browse:published:full")
assert.equal(browseCatalogCoalesceKey(undefined), "browse:published:full")
assert.equal(browseCatalogCoalesceKey({ product_type: "BED" }), null)
assert.equal(browseCatalogCoalesceKey({ category_id: "cat" }), null)
assert.equal(browseCatalogCoalesceKey({ handle: "ol-57-2" }), null)
assert.equal(browseCatalogCoalesceKey({ category_id: " " }), null)
assert.equal(browseCatalogCoalesceKey({ category_id: "" }), null)
assert.equal(browseCatalogCoalesceKey({ product_type: ["BED"] }), null)
assert.equal(browseCatalogCoalesceKey({ handle: 1 }), null)

let builds = 0
const build = () => {
  builds += 1
  return new Promise<string[]>((resolve) => {
    setTimeout(() => resolve(["a", "b"]), 30)
  })
}

async function main() {
  const key = browseCatalogCoalesceKey({})
  const first = coalesceBrowseCatalog(key, build)
  const second = coalesceBrowseCatalog(key, build)
  const [a, b] = await Promise.all([first, second])
  assert.equal(builds, 1)
  assert.deepEqual(a, ["a", "b"])
  assert.equal(a, b)

  await first
  const third = await coalesceBrowseCatalog(key, build)
  assert.equal(builds, 2)
  assert.deepEqual(third, ["a", "b"])

  let failed = 0
  const boom = () => {
    failed += 1
    return Promise.reject(new Error("build failed"))
  }
  await assert.rejects(() => coalesceBrowseCatalog(key, boom))
  await assert.rejects(() => coalesceBrowseCatalog(key, boom))
  assert.equal(failed, 2)

  const filtered = await coalesceBrowseCatalog(null, async () => {
    builds += 1
    return ["only"]
  })
  assert.deepEqual(filtered, ["only"])
  assert.equal(builds, 3)

  console.log("coalesce-browse-catalog.fidelity.test.ts ok")
}

void main()
