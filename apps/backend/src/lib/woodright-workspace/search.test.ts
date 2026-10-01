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

  it("matches a person by exact phone or email and a company by name", () => {
    const hits = searchHits({
      q: "8 (900) 000-00-01",
      orders: [],
      products: [],
      people: [
        { id: "lead_1", name: "Анна", email: "anna@x.ru", phone: "+7 900 000-00-01" },
        { id: "lead_2", name: "Борис", email: "b@x.ru", phone: "+7 900 000-00-02" },
      ],
      requests: [],
      companies: [{ id: "comp_1", name: "Studio X" }],
    })
    assert.deepEqual(hits.map((hit) => hit.id), ["lead_1"])
  })

  it("does not treat a partial phone as a unique match", () => {
    const hits = searchHits({
      q: "000-00",
      orders: [],
      products: [],
      people: [{ id: "lead_1", name: "Анна", email: "anna@x.ru", phone: "+7 900 000-00-01" }],
      requests: [],
      companies: [],
    })
    assert.equal(hits.length, 0)
  })

  it("finds a company by name", () => {
    const hits = searchHits({
      q: "studio",
      orders: [],
      products: [],
      people: [],
      requests: [],
      companies: [{ id: "comp_1", name: "Studio X" }],
    })
    assert.equal(hits[0]?.group, "company")
    assert.equal(hits[0]?.href, "/companies/comp_1")
  })
})
