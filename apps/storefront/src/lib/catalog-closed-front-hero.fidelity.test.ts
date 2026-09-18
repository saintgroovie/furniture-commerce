/**
 *   yarn dlx tsx src/lib/catalog-closed-front-hero.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  isWardrobeClosedFrontCandidate,
  preferClosedFrontCatalogHero,
  promoteClosedFrontHero,
} from "./catalog-closed-front-hero"

const wardrobe = {
  handle: "ol-01-2",
  title: "Шкаф для одежды 1-дв. с зеркалом (ручка слева/справа)",
  thumbnail: "/static/products/oliver/OL-01-2_main.jpg",
  images: [
    { url: "/static/products/oliver/OL-01-2_main.jpg" },
    { url: "/static/products/oliver/OL-01-2_gallery_02.jpg" },
    { url: "/static/products/oliver/OL-01-2_gallery_01.jpg" },
  ],
}

assert.equal(isWardrobeClosedFrontCandidate(wardrobe), true)
assert.equal(
  preferClosedFrontCatalogHero(wardrobe, wardrobe.thumbnail),
  "/static/products/oliver/OL-01-2_gallery_01.jpg"
)

{
  const promoted = promoteClosedFrontHero(wardrobe, [
    wardrobe.thumbnail,
    "/static/products/oliver/OL-01-2_gallery_02.jpg",
    "/static/products/oliver/OL-01-2_gallery_01.jpg",
  ])
  assert.equal(promoted[0], "/static/products/oliver/OL-01-2_gallery_01.jpg")
  assert.ok(promoted.includes(wardrobe.thumbnail))
}

{
  const chest = {
    handle: "ol-05-1",
    title: "Комод стандартный",
    thumbnail: "/static/products/oliver/OL-05-1_main.jpg",
    images: [
      { url: "/static/products/oliver/OL-05-1_main.jpg" },
      { url: "/static/products/oliver/OL-05-1_gallery_01.jpg" },
    ],
  }
  assert.equal(isWardrobeClosedFrontCandidate(chest), false)
  assert.equal(
    preferClosedFrontCatalogHero(chest, chest.thumbnail),
    chest.thumbnail
  )
}

{
  const bedNamedWardrobe = {
    handle: "ol-16-1",
    title: "Кровать со шкафом",
    thumbnail: "/static/products/oliver/OL-16-1_main.jpg",
    images: [
      { url: "/static/products/oliver/OL-16-1_main.jpg" },
      { url: "/static/products/oliver/OL-16-1_gallery_01.jpg" },
    ],
    metadata: { buyer_item_type: "krovati" },
  }
  assert.equal(isWardrobeClosedFrontCandidate(bedNamedWardrobe), false)
  assert.equal(
    preferClosedFrontCatalogHero(bedNamedWardrobe, bedNamedWardrobe.thumbnail),
    bedNamedWardrobe.thumbnail
  )
}

{
  const classifiedChest = {
    handle: "ol-05-1",
    title: "Комод-шкаф",
    thumbnail: "/static/products/oliver/OL-05-1_main.jpg",
    images: [
      { url: "/static/products/oliver/OL-05-1_main.jpg" },
      { url: "/static/products/oliver/OL-05-1_gallery_01.jpg" },
    ],
    metadata: { buyer_item_type: "komody" },
  }
  assert.equal(isWardrobeClosedFrontCandidate(classifiedChest), false)
}

{
  const classifiedNightstand = {
    handle: "ol-08-1",
    title: "Тумбочка у шкафа",
    thumbnail: "/static/products/oliver/OL-08-1_main.jpg",
    images: [{ url: "/static/products/oliver/OL-08-1_main.jpg" }],
    metadata: { buyer_item_type: "tumby" },
  }
  assert.equal(isWardrobeClosedFrontCandidate(classifiedNightstand), false)
}

{
  const classifiedWardrobe = {
    handle: "ol-02-1",
    title: "Шкаф для одежды 2-дв.",
    thumbnail: "/static/products/oliver/OL-02-1_main.jpg",
    images: [
      { url: "/static/products/oliver/OL-02-1_main.jpg" },
      { url: "/static/products/oliver/OL-02-1_gallery_01.jpg" },
    ],
    metadata: { buyer_item_type: "shkafy" },
  }
  assert.equal(isWardrobeClosedFrontCandidate(classifiedWardrobe), true)
  assert.equal(
    preferClosedFrontCatalogHero(classifiedWardrobe, classifiedWardrobe.thumbnail),
    "/static/products/oliver/OL-02-1_gallery_01.jpg"
  )
}

{
  const corner = {
    handle: "ol-00-1",
    title: "Шкаф угловой (ручка слева/справа)",
    thumbnail: "/static/products/oliver/OL-00-1_main.jpg",
    images: [{ url: "/static/products/oliver/OL-00-1_main.jpg" }],
  }
  assert.equal(
    preferClosedFrontCatalogHero(corner, corner.thumbnail),
    corner.thumbnail
  )
}

console.log("catalog-closed-front-hero fidelity: ok")
