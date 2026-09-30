import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { searchHits } from "./search.ts"

describe("searchHits", () => {
  it("groups a short query and ignores one character", () => {
    assert.deepEqual(searchHits({ q: "a", orders: [], products: [], people: [], requests: [] }), [])
    const hits = searchHits({
      q: "OL-01",
      orders: [{ id: "order_1", display_id: 4, email: "a@x.ru" }],
      products: [{ id: "prod_1", title: "Оливер", skus: ["OL-01-1"] }],
      people: [{ id: "lead_1", name: "Анна", email: "anna@x.ru", phone: null }],
      requests: [{ id: "req_1", name: "Анна", comment: "стол" }],
    })
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.group, "product")
  })
})
