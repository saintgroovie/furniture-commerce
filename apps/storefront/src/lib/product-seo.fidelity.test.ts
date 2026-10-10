/**
 * PDP SEO surfaces: entity name, meta description, buyer/JSON-LD description.
 *   yarn dlx tsx src/lib/product-seo.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sanitizeBuyerDescription, SHARED_EXECUTION_NOTE } from "./catalog-normalization"
import { auditCatalogSeo, PROMISE_OR_CLICHE_RE } from "./catalog-seo-audit"
import { compactDisplayGroupChipLabels } from "./display-group"
import {
  buildProductMetaDescription,
  getBuyerDescription,
  getProductSeoName,
  getSeoDescriptionSource,
  META_DESCRIPTION_MAX,
} from "./product-seo"

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ")
const priced = { hasOptions: false, priceMode: "price" as const }

const recovered = {
  handle: "mnm-05-3",
  title: "Комод высокий",
  metadata: { collection: "monchelsea", dimensions: { height_mm: 1494, width_mm: 602, depth_mm: 574 } },
  description: "Комод высокий\n1494 × 602 × 574 мм\nПорядок: высота, ширина, глубина. Источник - ячейка прайса",
}

const motifRow = {
  handle: "fa-05-3",
  title: "Комод высокий Fairies (гл. 560)",
  subtitle: "Высокий детский комод с росписью Fairies — полная глубина 56 см.",
  metadata: { collection: "willie-winkie", storefront_section: "kids", motif_slug: "fairies", painting_name: "Fairies" },
  description:
    "Высокий комод серии Fairies (Willie Winkie) в полноглубокой версии - 56 см: в каждом ящике больше места, чем у версий с глубиной 44 см. Вертикальная компоновка экономит стену.\n\nРоспись Fairies делает комод частью сюжетной серии - к нему подбираются стол и туалетный столик с тем же мотивом.\n\nЕсть варианты исполнения - уточним в заявке",
}

/* Sanitizer: internal price-list lines go, prose and the shared note stay on the PDP. */
{
  assert.equal(getBuyerDescription(recovered), null, "title echo + size line + provenance → nothing buyer-facing")
  const r = sanitizeBuyerDescription(recovered.description, { title: recovered.title })
  assert.deepEqual(r.removed, ["title_echo", "dimension_line", "provenance_line"])

  const visible = getBuyerDescription(motifRow)!
  assert.match(visible, /Вертикальная компоновка экономит стену/)
  assert.ok(visible.endsWith(SHARED_EXECUTION_NOTE), "PDP keeps the shared note")
  assert.equal(visible.split("\n\n").length, 3, "paragraphs preserved")

  const ld = getSeoDescriptionSource(motifRow)!
  assert.ok(!ld.includes(SHARED_EXECUTION_NOTE), "JSON-LD / snippet drop the shared note")

  const pr = sanitizeBuyerDescription(
    "Тумбочка прикроватная (ручки Swarovski)\nВ названии прайса указаны ручки Swarovski\n600 × 530 × 450 мм\nПорядок: высота, ширина, глубина. Источник - ячейка прайса 18.09.2026",
    { title: "Тумбочка прикроватная (ручки Swarovski)" }
  )
  assert.equal(pr.text, null)

  const prose = "Размер 120 × 190 мм в тексте.\nДругая строка."
  assert.equal(sanitizeBuyerDescription(prose).text, prose, "dimension inside prose is not a size line")
  assert.equal(sanitizeBuyerDescription("").text, null)
  assert.equal(sanitizeBuyerDescription(null).text, null)
}

/* Entity name: H1 + painting for Willie Winkie rows; no painting for others. */
{
  assert.equal(plain(getProductSeoName(motifRow)), "Высокий комод Вилли Винки, роспись «Феи»")
  assert.equal(plain(getProductSeoName(recovered)), "Высокий комод Мончелси")
  const unknownMotif = { ...motifRow, metadata: { ...motifRow.metadata, motif_slug: "not-a-motif" } }
  assert.doesNotMatch(getProductSeoName(unknownMotif), /роспись/, "only canonical motif slugs")
}

/* Meta description: whole sentences, ≤160, no ASCII ellipsis, no promises. */
{
  const m = buildProductMetaDescription(motifRow, priced)
  assert.ok(m.length <= META_DESCRIPTION_MAX)
  assert.ok(!m.includes("..."))
  assert.doesNotMatch(m, /[—–]/u)
  assert.ok(/[.!?]$/u.test(m) || m.endsWith("…"))

  const short = {
    handle: "ol-23-1",
    title: "Стул",
    metadata: { collection: "oliver" },
    description: "Стул Oliver - 48 × 46 см в плане, высота по спинке 90,5 см. Спинка с филёнкой.\n\nЕсть варианты исполнения - уточним в заявке",
  }
  assert.equal(
    buildProductMetaDescription(short, priced),
    "Стул Oliver - 48 × 46 см в плане, высота по спинке 90,5 см. Спинка с филёнкой."
  )

  const longFirst = {
    ...short,
    subtitle: "Стул Oliver — высота по спинке 90,5 см.",
    description: `${"Очень длинное первое предложение без точки ".repeat(6)}конец.`,
  }
  assert.equal(buildProductMetaDescription(longFirst, priced), "Стул Oliver - высота по спинке 90,5 см.", "subtitle when the first sentence is too long")

  const noSubtitle = { ...longFirst, subtitle: null }
  const cut = buildProductMetaDescription(noSubtitle, priced)
  assert.ok(cut.endsWith("…") && cut.length <= META_DESCRIPTION_MAX, "word-boundary cut with a real ellipsis")
}

/* Fallback: unique by entity name, factual, no promise words. */
{
  const fb = buildProductMetaDescription(recovered, priced)
  assert.equal(plain(fb), "Высокий комод Мончелси. Посмотрите размеры и цену на сайте Woodright.")
  const withOptions = buildProductMetaDescription(recovered, { hasOptions: true, priceMode: "price" })
  assert.match(withOptions, /размеры, варианты исполнения и цену/)
  const quote = buildProductMetaDescription(recovered, { hasOptions: false, priceMode: "quote" })
  assert.match(quote, /оставьте заявку на расчёт/)
  assert.doesNotMatch(quote, /цену/)
  for (const s of [fb, withOptions, quote]) assert.doesNotMatch(s, PROMISE_OR_CLICHE_RE)
}

/* Audit over a mini catalog: no duplicates once paintings disambiguate. */
{
  const twin = { ...motifRow, handle: "pa-05-3", title: "Комод высокий Patchwork (гл. 560)", metadata: { ...motifRow.metadata, motif_slug: "patchwork" } }
  const { summary } = auditCatalogSeo([motifRow, twin, recovered])
  assert.equal(summary.duplicate_seo_name, 0)
  assert.equal(summary.duplicate_meta_description, 2, "same owner prose on two rows is reported, not hidden")
  assert.equal(summary.description_internal_provenance, 0)
}

/* Size chips inside one family show only what differs. */
{
  assert.deepEqual(
    compactDisplayGroupChipLabels([
      "Полутораспальная кровать Прованс (120 × 190) без изножья",
      "Полутораспальная кровать Прованс (120 × 190) с тканью без изножья",
      "Полутораспальная кровать Прованс (140 × 190) без изножья",
    ]),
    ["120 × 190 без изножья", "120 × 190 с тканью без изножья", "140 × 190 без изножья"]
  )
  assert.deepEqual(
    compactDisplayGroupChipLabels(["Односпальная кровать Гринвич (90 × 200)", "Двуспальная кровать Гринвич (160 × 200)"]),
    ["90 × 200", "160 × 200"]
  )
  assert.deepEqual(
    compactDisplayGroupChipLabels(["Стол Оливер с ящиком", "Стол Оливер с полкой"]),
    ["с ящиком", "с полкой"],
    "no size → shared leading words dropped"
  )
  assert.deepEqual(
    compactDisplayGroupChipLabels(["Кровать (90 × 200)", "Кровать (90 × 200)"]),
    ["Кровать (90 × 200)", "Кровать (90 × 200)"],
    "colliding short forms → full labels"
  )
  assert.deepEqual(compactDisplayGroupChipLabels(["Кровать (90 × 200)"]), ["Кровать (90 × 200)"])
}

/* PDP shows one buyer name: no raw price-list `canonical_name` line under H1. */
{
  const pdpSrc = readFileSync(join(__dirname, "..", "app", "product", "[id]", "page.tsx"), "utf8")
  assert.doesNotMatch(pdpSrc, /pdp-canonical-name|getCanonicalName\(/)
  assert.match(pdpSrc, /getProductSeoName\(product\)/)
  assert.match(pdpSrc, /buildProductMetaDescription\(product/)
  assert.doesNotMatch(pdpSrc, /truncate\(String\(product\.description\)/)
}

console.log("product-seo fidelity: ok")
