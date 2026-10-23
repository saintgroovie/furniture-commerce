/**
 * Buyer name projection. Run from apps/storefront:
 *   npx --yes tsx src/lib/product-title-presentation.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { withoutHeadingDimensions } from "./product-heading"
import {
  BUYER_FACING_DIMENSION_ORDER,
  formatDimensionsCompactLabeled,
  getBuyerFacingProductTitle,
} from "./product-metadata"
import { presentBuyerCartLine, presentBuyerOptionChoice, presentBuyerTitleParts } from "./product-title-presentation"

function plain(value: string): string {
  return value.replace(/\u00a0/g, " ")
}

function present(title: string, handle: string, metadata?: Record<string, unknown>) {
  const source = { title, handle, metadata: metadata ?? null }
  const before = JSON.stringify(source)
  const result = presentBuyerTitleParts(source)
  assert.equal(JSON.stringify(source), before, "presentation does not mutate the source")
  return {
    base: plain(result.base_title),
    caption: plain(result.caption),
    lines: result.lines.map(plain),
  }
}

const cases = [
  ["pv-66-7", "Стол письменный 2-тумб. ЯП", "Письменный стол Прованс с двумя тумбами", "Ящики слева, полки справа"],
  ["pv-66-6", "Стол письменный 2-тумб. ПЯ", "Письменный стол Прованс с двумя тумбами", "Полки слева, ящики справа"],
  ["ol-66-1", "Стол письменный 2-тумб. ПП", "Письменный стол Оливер с двумя тумбами", "Полки с обеих сторон"],
  ["ol-66-4", "Стол кабинетный письменный 2-тумб. ПП", "Кабинетный стол Оливер с двумя тумбами", "Полки с обеих сторон"],
  ["co-66-1", "Стол письменный 2-тумб. ЯЯ", "Письменный стол Кантри с двумя тумбами", "Ящики с обеих сторон"],
] as const

for (const [handle, title, base, caption] of cases) {
  const got = present(title, handle)
  assert.equal(got.base, base, handle)
  assert.equal(got.caption, caption, handle)
  assert.equal(got.lines.join(" "), base, `${handle} lines`)
  assert.doesNotMatch(got.base, /ЯП|ПЯ|ЯЯ|ПП|2-тумб|1,5-сп|120\s*[×xх*]/u)
}

{
  const stored = present("сырой заголовок", "pv-66-7", {
    public_title: "Стол письменный 2-тумб. ЯП",
  })
  assert.equal(stored.base, "Письменный стол Прованс с двумя тумбами")
  assert.equal(stored.caption, "Ящики слева, полки справа")
}

{
  const coded = present("Стол письменный 2-тумб. ЯП (ручки Swarovski)", "pv-66-7")
  assert.equal(coded.caption, "Ящики слева, полки справа")
  assert.match(coded.base, /ручки/)
  assert.match(coded.base, /Сваровски|Swarovski/)
  assert.doesNotMatch(coded.base, /ЯП|2-тумб/)
}

for (const title of ["Кровать (120×190)", "Кровать 120 * 190 см", "Кровать 120х190", "Кровать 120 x 190"]) {
  const got = present(title, "ol-14-2")
  assert.doesNotMatch(got.base, /\d\s*[×xх*]\s*\d/u, title)
  assert.match(got.caption, /Спальное место: 120 × 190 см/, title)
}

{
  const named = present("Ателье 1905", "custom-atelier")
  assert.equal(named.base, "Ателье 1905")
  assert.equal(named.caption, "")
}

{
  const kept = present("Комод Scale", "ol-05-1", { public_title: "Комод Scale" })
  assert.match(kept.base, /Комод/)
  assert.doesNotMatch(kept.base, /2-тумб|ЯП|ЯЯ/)
}

assert.equal(withoutHeadingDimensions("Шкаф с 2 дверцами и 3 ящиками"), "Шкаф с 2 дверцами и 3 ящиками")
for (const title of ["Кровать (120×190)", "Кровать 120 * 190 см", "Кровать 120х190", "Кровать под матрас 120 x 190", "Кровать (120 × 190 × 80)"]) {
  assert.equal(withoutHeadingDimensions(title), "Кровать", title)
}
assert.equal(withoutHeadingDimensions("Комод (гл. 560) с 3 ящиками"), "Комод с 3 ящиками")
assert.equal(withoutHeadingDimensions("Стол ширина 120 см"), "Стол")
assert.equal(withoutHeadingDimensions("Стол (Ø60 см)"), "Стол")
assert.equal(withoutHeadingDimensions("Стол 1,2 м"), "Стол")
assert.equal(withoutHeadingDimensions("Кровать (120×190) без изножья"), "Кровать без изножья")

{
  const provenceA = present("Стол письменный 2-тумб. ЯП", "pv-66-7")
  const provenceB = present("Стол письменный 2-тумб. ПЯ", "pv-66-6")
  assert.equal(provenceA.base, provenceB.base, "invariant two-pedestal name is shared")
  assert.match(provenceA.base, /с двумя тумбами/)
  assert.notEqual(provenceA.caption, provenceB.caption, "filling stays a separate choice")
}

{
  const foot = present("Кровать 1,5-сп. (140×190) без изножья", "ol-16-2")
  assert.equal(foot.base, "Кровать Оливер без изножья")
  assert.match(foot.caption, /Спальное место: 140 × 190 см/)
  assert.match(foot.caption, /Класс: полутораспальная/)
  assert.doesNotMatch(foot.base, /\d/)
}

{
  const axes = present(
    "Стол письменный 2-тумб. глубина 70 см, ширина 156 см, высота 78 см",
    "ol-66-1",
  )
  assert.equal(axes.base, "Письменный стол Оливер с двумя тумбами")
  assert.doesNotMatch(axes.base, /\d|,/)
  const height = axes.caption.indexOf("В 78")
  const width = axes.caption.indexOf("Ш 156")
  const depth = axes.caption.indexOf("Г 70")
  assert.ok(height >= 0 && width > height && depth > width, axes.caption)
}

{
  assert.deepEqual([...BUYER_FACING_DIMENSION_ORDER], ["height", "width", "depth"])
  const labeled = formatDimensionsCompactLabeled({
    height_mm: 780,
    width_mm: 1560,
    depth_mm: 700,
  })
  assert.equal(labeled.caption, "В × Ш × Г, см")
  assert.equal(plain(labeled.values).replace(/\u202F/g, " "), "78 × 156 × 70")
}

{
  const family = {
    title: "Кровать 1,5-сп. (120×200)",
    handle: "greenwich-gr-12-1",
    metadata: { display_group: "greenwich-bed", canonical_name: "Кровать Greenwich" },
  }
  const opening = presentBuyerTitleParts(family)
  assert.equal(plain(opening.base_title), "Кровать Гринвич")
  assert.equal(plain(opening.caption), "Класс: полутораспальная; Спальное место: 120 × 200 см")
  assert.equal(getBuyerFacingProductTitle(family), plain(opening.base_title))
  const alone = present("Кровать 1,5-сп. (120×200)", "greenwich-gr-12-1")
  assert.equal(alone.base, "Кровать Гринвич")
}

{
  const selected = presentBuyerTitleParts({
    title: "Кровать 1,5-сп. (120×200)",
    handle: "greenwich-gr-12-1",
    metadata: { display_group: "greenwich-bed" },
    selection: {
      title: "Кровать 2-сп. (180×200)",
      metadata: {
        mattress_size: {
          key: "180x200",
          width_cm: 180,
          length_cm: 200,
          display: "180 × 200 см",
          source: "title",
          confidence: "high",
        },
      },
    },
  })
  assert.equal(plain(selected.base_title), "Кровать Гринвич")
  assert.match(plain(selected.caption), /Класс: двуспальная/)
  assert.match(plain(selected.caption), /Спальное место: 180 × 200 см/)
  assert.doesNotMatch(plain(selected.caption), /полутораспальная|120/)
}

{
  const sizeOnly = presentBuyerTitleParts({
    title: "Кровать 1,5-сп. (120×200)",
    handle: "greenwich-gr-12-1",
    metadata: { display_group: "greenwich-bed" },
    selection: {
      metadata: {
        mattress_size: {
          key: "180x200",
          width_cm: 180,
          length_cm: 200,
          display: "180 × 200 см",
          source: "title",
          confidence: "high",
        },
      },
    },
  })
  assert.equal(plain(sizeOnly.base_title), "Кровать Гринвич")
  assert.equal(plain(sizeOnly.caption), "Спальное место: 180 × 200 см")
  assert.doesNotMatch(plain(sizeOnly.caption), /полутораспальная|двуспальная/)
}

{
  const metre = present("Тумба высота 1,2 м", "custom-measure")
  assert.equal(metre.base, "Тумба")
  assert.match(metre.caption, /В 1,2 м/)
  assert.doesNotMatch(metre.caption, /1,2 см/)
  const loose = present("Стол 1,2 м", "custom-measure")
  assert.equal(loose.base, "Стол")
  assert.match(loose.caption, /1,2 м/)
  assert.doesNotMatch(loose.caption, /1,2 см/)
  const mm = present("Стол глубина 440 мм", "custom-measure")
  assert.match(mm.caption, /Г 440 мм/)
  assert.doesNotMatch(mm.caption, /440 см/)
  const cm = present("Стол ширина 120 см", "custom-measure")
  assert.match(cm.caption, /Ш 120 см/)
  assert.doesNotMatch(cm.caption, /1200|1,2 м/)
  for (const [title, expected] of [
    ["Кровать (1,2 × 2 м)", "Спальное место: 1,2 × 2 м"],
    ["Кровать (120 × 200 см)", "Спальное место: 120 × 200 см"],
    ["Кровать (120 × 200 мм)", "Спальное место: 120 × 200 мм"],
  ] as const) {
    const got = present(title, "custom-measure")
    assert.equal(got.base, "Кровать", title)
    assert.equal(got.caption, expected, title)
  }
  const body = presentBuyerTitleParts({ title: "Комод (120 × 60 × 45)", handle: "custom-measure" })
  assert.equal(plain(body.base_title), "Комод")
  assert.equal(plain(body.caption), "120 × 60 × 45")
  assert.equal(body.attributes.find((item) => item.value.includes("120"))?.source, "title_measure")
  assert.doesNotMatch(plain(body.caption), /см|мм/)
}

{
  const line = {
    title: "Кровать 1,5-сп. (120×200)",
    product_handle: "greenwich-gr-12-1",
    variant_id: "v180",
    sku: "GR-18-1",
    product: {
      title: "Кровать 1,5-сп. (120×200)",
      handle: "greenwich-gr-12-1",
      metadata: {
        display_group: "greenwich-bed",
        public_title: "Кровать 1,5-сп. (120×200)",
      },
    },
    variant: {
      id: "v180",
      title: "Кровать 2-сп. (180×200)",
      sku: "GR-18-1",
      metadata: {},
    },
  }
  const before = JSON.stringify(line)
  const presented = presentBuyerCartLine(line)
  assert.equal(JSON.stringify(line), before, "cart line snapshot is not rewritten")
  assert.equal(line.sku, "GR-18-1")
  assert.equal(line.variant_id, "v180")
  assert.equal(plain(presented?.base_title ?? ""), "Кровать Гринвич")
  assert.match(plain(presented?.caption ?? ""), /Класс: двуспальная/)
  assert.match(plain(presented?.caption ?? ""), /Спальное место: 180 × 200 см/)
  assert.doesNotMatch(plain(presented?.caption ?? ""), /полутораспальная/)
  assert.equal(
    getBuyerFacingProductTitle(line.product),
    plain(presented?.base_title ?? ""),
  )
  const sibling = presentBuyerTitleParts({
    title: "Кровать 1-сп. (90×200)",
    handle: "greenwich-gr-09-1",
    metadata: { display_group: "greenwich-bed" },
  })
  const openingMember = presentBuyerTitleParts({
    title: "Кровать 1,5-сп. (120×200)",
    handle: "greenwich-gr-12-1",
    metadata: { display_group: "greenwich-bed" },
  })
  assert.equal(plain(sibling.base_title), plain(openingMember.base_title))
  assert.equal(plain(sibling.base_title), "Кровать Гринвич")
  assert.notEqual(plain(sibling.caption), plain(openingMember.caption))
  assert.match(plain(sibling.caption), /Спальное место: 90 × 200 см/)
  assert.doesNotMatch(plain(sibling.base_title), /Односпальная|Полутораспальная/)
  const named = {
    title: "Кровать 1,5-сп. (120×200)",
    handle: "bed-custom-1",
    metadata: { display_group: "greenwich-bed", canonical_name: "Кровать Greenwich" },
  }
  const namedLine = {
    title: named.title,
    product: named,
    variant: { title: "Кровать 2-сп. (180×200)", sku: "GR-18-1" },
    sku: "GR-18-1",
  }
  const namedShown = presentBuyerCartLine(namedLine)
  assert.equal(getBuyerFacingProductTitle(named), plain(namedShown?.base_title ?? ""))
  assert.equal(plain(namedShown?.base_title ?? ""), "Кровать Гринвич")
  assert.match(plain(namedShown?.caption ?? ""), /двуспальная/)
  assert.doesNotMatch(plain(namedShown?.caption ?? ""), /полутораспальная/)
  const storedProduct = {
    title: "сырой заголовок",
    handle: "pv-66-7",
    metadata: { public_title: "Стол письменный 2-тумб. ЯП" },
  }
  const storedShown = presentBuyerCartLine({ title: storedProduct.title, product: storedProduct })
  assert.equal(getBuyerFacingProductTitle(storedProduct), plain(storedShown?.base_title ?? ""))
  assert.equal(plain(storedShown?.base_title ?? ""), "Письменный стол Прованс с двумя тумбами")
  assert.equal(plain(storedShown?.caption ?? ""), "Ящики слева, полки справа")
  const checkout = readFileSync(new URL("../components/checkout-form.tsx", import.meta.url), "utf8")
  const cart = readFileSync(new URL("../components/cart-summary.tsx", import.meta.url), "utf8")
  const card = readFileSync(new URL("../components/product-card.tsx", import.meta.url), "utf8")
  assert.match(checkout, /presentBuyerCartLine/)
  assert.match(cart, /presentBuyerCartLine/)
  assert.match(cart, /cart-line-choice/)
  assert.match(checkout, /presented\.caption/)
  assert.match(card, /titleLayout\.caption/)
  assert.match(card, /card-choice/)
  assert.doesNotMatch(checkout, /presentBuyerTitleParts/)
  assert.doesNotMatch(cart, /presentBuyerTitleParts/)
}

{
  const page = readFileSync(new URL("../app/product/[id]/page.tsx", import.meta.url), "utf8")
  assert.match(page, /name:\s*getBuyerFacingProductTitle\(product\)/)
  assert.match(page, /pdp-choice/)
  assert.match(page, /const title = getProductSeoName\(product\)/)
}

{
  const choice = presentBuyerOptionChoice("Default", "ЯП")
  assert.equal(choice?.axisLabel, "Наполнение тумб")
  assert.equal(choice?.valueLabel, "Ящики слева, полки справа")
  assert.equal(presentBuyerOptionChoice("Цвет", "синий"), null)
  const shelf = presentBuyerOptionChoice("Размер", "90 × 200 см")
  assert.equal(shelf?.axisLabel, "Размер")
  assert.equal(plain(shelf?.valueLabel ?? ""), "90 × 200 см")
  const bedSize = presentBuyerOptionChoice("Размер", "90 × 200 см", { mattress: true })
  assert.equal(bedSize?.axisLabel, "Размер спального места")
  const plainBed = presentBuyerOptionChoice("Default", "90 × 200 см")
  assert.equal(plainBed?.axisLabel, "Размер")
  const named = presentBuyerOptionChoice("Спальное место", "90 × 200 см")
  assert.equal(named?.axisLabel, "Размер спального места")
}

{
  const sizeOnly = presentBuyerTitleParts({
    title: "Кровать 1,5-сп. (120×200)",
    handle: "greenwich-gr-12-1",
    metadata: { display_group: "greenwich-bed" },
    selection: { title: "180 × 200", metadata: {} },
  })
  assert.equal(plain(sizeOnly.base_title), "Кровать Гринвич")
  assert.equal(plain(sizeOnly.caption), "Спальное место: 180 × 200 см")
  assert.equal(sizeOnly.attributes.some((item) => item.source === "bed_class"), false)
  assert.doesNotMatch(plain(sizeOnly.caption), /120|полутораспальная|односпальная|двуспальная/iu)
}

{
  const bare = presentBuyerOptionChoice("Размер", "600 × 400")
  assert.equal(bare?.axisLabel, "Размер")
  assert.equal(plain(bare?.valueLabel ?? ""), "600 × 400")
  const explicit = presentBuyerOptionChoice("Размер", "600 × 400 см")
  assert.equal(explicit?.axisLabel, "Размер")
  assert.equal(plain(explicit?.valueLabel ?? ""), "600 × 400 см")
}

console.log("product-title-presentation.fidelity.test.ts ok")
