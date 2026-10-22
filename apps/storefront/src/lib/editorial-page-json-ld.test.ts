import assert from "node:assert/strict"
import { editorialPageJsonLd, roomPageJsonLd, roomDirectoryJsonLd, motifPageJsonLd, motifDirectoryJsonLd } from "./editorial-page-json-ld"
import { jsonLdHtml } from "./json-ld"
const base = "https://woodright.ru"
const forbidden = new Set(["sku", "mpn", "gtin", "price", "priceCurrency", "offers", "lowPrice", "highPrice", "availability", "aggregateRating", "review", "candidate_skus", "matched_skus"])
function validate(value: unknown) {
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.has(key), `not allowed: ${key}`)
    if (key === "@type") assert(!["Product", "ProductGroup", "Offer", "AggregateOffer"].includes(String(child)))
    validate(child)
  }
}
function graph(payload: Record<string, unknown> | null) {
  assert(payload); validate(payload)
  return payload["@graph"] as Array<Record<string, any>>
}
const room = { slug: "confirmed-room", title: "Комната", is_active: true, room_type: "детская", price_from: 999999,
  hero_image: "/static/room.webp", candidate_skus: [{ sku: "GUESS", price: 42, handle: "guessed-product" }],
  items: [
    { sort_order: 1, product: { handle: "desk", title: "Стол", sku: "PRIVATE-SKU", price: 999 } },
    { sort_order: 0, product: { handle: "bed", title: "Кровать" } },
    { sort_order: 3, product: { handle: "desk", title: "Стол", sku: "PRIVATE-SKU" } },
    { product: { handle: "../../unknown", title: "Unknown" } },
    { product: { id: "internal-id", title: "Нет публичного адреса" } },
  ] }
const roomGraph = graph(roomPageJsonLd(base, room))
assert.equal(roomGraph[0].url, `${base}/rooms/confirmed-room`)
assert.equal(roomGraph[0].primaryImageOfPage.contentUrl, `${base}/product-static/room.webp`)
assert.deepEqual(roomGraph[2].itemListElement.map(x => x.name), ["Кровать", "Стол"])
assert.equal(roomGraph[2].numberOfItems, 2)
assert.equal(roomGraph[1].itemListElement.at(-2).item, `${base}/kids/rooms`)
assert(!JSON.stringify(roomGraph).includes("GUESS"))
assert.equal(roomPageJsonLd(base, { ...room, is_active: false }), null)
assert.equal(roomPageJsonLd(base, { ...room, is_active: undefined }), null)
assert.equal(roomPageJsonLd(base, { ...room, slug: "../fake" }), null)
const noComposition = graph(roomPageJsonLd(base, { ...room, items: [] }))
assert.equal(noComposition.length, 2)
assert(!("mainEntity" in noComposition[0]))
assert.equal(graph(roomDirectoryJsonLd(base, [room, { ...room, slug: "draft", is_active: false }], true, "Детские комнаты"))[2].numberOfItems, 1)
const theme = { motif_slug: "fairies", motif_title: "Феи", motif_available_product_count: 1,
  products: [{ handle: "fa-05-3", title: "Комод", sku: "UNCONFIRMED", price_amount: 123 }],
  candidate_skus: [{ sku: "GUESS" }] }
const motifGraph = graph(motifPageJsonLd(base, theme, "/images/editorial/fairies.webp"))
assert.equal(motifGraph[2].itemListElement[0].url, `${base}/product/fa-05-3`)
assert(!JSON.stringify(motifGraph).includes("UNCONFIRMED"))
assert.equal(motifPageJsonLd(base, { ...theme, products: [] }, null), null)
assert.equal(graph(motifDirectoryJsonLd(base, [theme, { motif_slug: "empty", motif_title: "Пусто", motif_available_product_count: 0 }]))[2].numberOfItems, 1)
const escaped = editorialPageJsonLd({ siteUrl: base, path: "/rooms/example", name: '</script><script>alert("test")</script>',
  image: "javascript:alert(1)", breadcrumbs: [{ name: "Главная", path: "/" }, { name: "Пример", path: "/rooms/example" }],
  entries: [{ name: "Чужой сайт", path: "//evil.example/product" }],
})
assert(!jsonLdHtml(escaped).includes("</script>"))
assert.deepEqual(JSON.parse(jsonLdHtml(escaped)), escaped)
assert.equal(graph(escaped).length, 2)
assert(!("primaryImageOfPage" in graph(escaped)[0]))
assert.equal(editorialPageJsonLd({ siteUrl: "javascript:bad", path: "/rooms", name: "Комнаты", breadcrumbs: [], entries: [] }), null)
console.log("editorial-page-json-ld.test.ts: ok")
