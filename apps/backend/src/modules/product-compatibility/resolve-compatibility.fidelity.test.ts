/**
 * Compatibility is an explicit link, not a collection guess.
 *   yarn dlx tsx src/modules/product-compatibility/resolve-compatibility.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { resolveCompatibilityView } from "./resolve-compatibility"

const products = [
  { id: "pr83", title: "Столешница", handle: "pr-83-1", status: "draft" },
  { id: "pr05", title: "Комод", handle: "pr-05-1", status: "draft" },
  { id: "ol83", title: "Столешница", handle: "ol-83-1", status: "published" },
  { id: "ol05", title: "Комод", handle: "ol-05-1", status: "published" },
  { id: "ol05-2", title: "Комод широкий", handle: "ol-05-2", status: "published" },
]
const links = [
  { accessory_product_id: "pr83", product_id: "pr05" },
  { accessory_product_id: "ol83", product_id: "ol05" },
]

const chest = resolveCompatibilityView({ productId: "ol05", links, products })
assert.deepEqual(chest.accessories.map((item) => item.id), ["ol83"])
assert.deepEqual(chest.compatible_with, [])

const top = resolveCompatibilityView({ productId: "ol83", links, products })
assert.deepEqual(top.compatible_with.map((item) => item.id), ["ol05"])
assert.deepEqual(top.accessories, [])

const otherChest = resolveCompatibilityView({ productId: "ol05-2", links, products })
assert.deepEqual(otherChest.accessories, [])
assert.deepEqual(otherChest.compatible_with, [])

const draftChest = resolveCompatibilityView({ productId: "pr05", links, products })
assert.deepEqual(draftChest.accessories, [])

const mixed = [
  ...products,
  { id: "draft-top", title: "Черновик", handle: "draft-top", status: "draft" },
  { id: "pub-chest", title: "Комод", handle: "pub-chest", status: "published" },
  { id: "pub-top", title: "Столешница", handle: "pub-top", status: "published" },
  { id: "draft-chest", title: "Черновик", handle: "draft-chest", status: "draft" },
]
const mixedLinks = [
  ...links,
  { accessory_product_id: "draft-top", product_id: "pub-chest" },
  { accessory_product_id: "pub-top", product_id: "draft-chest" },
]
assert.deepEqual(
  resolveCompatibilityView({ productId: "draft-top", links: mixedLinks, products: mixed }),
  { accessories: [], compatible_with: [] }
)
assert.deepEqual(
  resolveCompatibilityView({ productId: "pub-chest", links: mixedLinks, products: mixed }).accessories,
  []
)
assert.deepEqual(
  resolveCompatibilityView({ productId: "draft-chest", links: mixedLinks, products: mixed }),
  { accessories: [], compatible_with: [] }
)
assert.deepEqual(
  resolveCompatibilityView({ productId: "pub-top", links: mixedLinks, products: mixed }).compatible_with,
  []
)
assert.deepEqual(
  resolveCompatibilityView({
    productId: "ol05",
    links,
    products: products.filter((product) => product.id !== "ol05"),
  }),
  { accessories: [], compatible_with: [] }
)

const unsupported = resolveCompatibilityView({
  productId: "nowhere",
  links,
  products,
})
assert.deepEqual(unsupported, { accessories: [], compatible_with: [] })

for (const card of [...chest.accessories, ...top.compatible_with]) {
  assert.deepEqual(Object.keys(card).sort(), ["handle", "id", "title"])
}

console.log("resolve-compatibility.fidelity.test.ts: ok")
