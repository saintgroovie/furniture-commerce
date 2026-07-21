/**
 * Contract: Willie Winkie buyer-safe motif theme DTO.
 *
 *   node_modules/.bin/tsx src/lib/motif-theme.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  assertBuyerSafeMotifPayload,
  buildMotifContext,
  buildMotifThemeDetail,
  buildMotifThemes,
  motifCtaKind,
  MOTIF_CTA_LABELS,
} from "./motif-theme"

function ww(partial: {
  handle: string
  title: string
  motif_slug: string
  motif_title: string
  motif_key?: string
  family_key: string
  family_canonical_title: string
  thumbnail?: string
  price?: number
}): Record<string, unknown> {
  return {
    handle: partial.handle,
    title: partial.title,
    thumbnail: partial.thumbnail ?? `/static/${partial.handle}.jpg`,
    metadata: {
      collection: "willie-winkie",
      motif_key: partial.motif_key ?? `ww-motif:${partial.motif_slug}`,
      motif_slug: partial.motif_slug,
      motif_title: partial.motif_title,
      family_key: partial.family_key,
      family_canonical_title: partial.family_canonical_title,
      source_title: "INTERNAL SOURCE TITLE",
      family_options: { Size: "x" },
      planned_materials: [{ material_key: "LDSP", status: "planned" }],
      material_key: "UNKNOWN",
      material_status: "unknown",
    },
    variants: [{ id: "var_secret", sku: "SKU-SECRET", prices: [{ amount: partial.price ?? 10000 }] }],
  }
}

const sample = [
  ww({
    handle: "te-05-1",
    title: "Комод Templars",
    motif_slug: "templars",
    motif_title: "Templars",
    family_key: "willie-winkie:t05:komod",
    family_canonical_title: "Комод",
    price: 45000,
  }),
  ww({
    handle: "te-02-2",
    title: "Шкаф Templars",
    motif_slug: "templars",
    motif_title: "Templars",
    family_key: "willie-winkie:t02:shkaf",
    family_canonical_title: "Двухдверный шкаф для одежды",
    price: 90000,
  }),
  ww({
    handle: "te-01-1",
    title: "Кровать Templars",
    motif_slug: "templars",
    motif_title: "Templars",
    family_key: "willie-winkie:t01:krovat",
    family_canonical_title: "Кровать",
    price: 70000,
  }),
  ww({
    handle: "ba-05-1",
    title: "Комод Ballet",
    motif_slug: "ballet",
    motif_title: "Ballet",
    family_key: "willie-winkie:t05:komod",
    family_canonical_title: "Комод",
    price: 46000,
  }),
  ww({
    handle: "ba-02-1",
    title: "Шкаф Ballet",
    motif_slug: "ballet",
    motif_title: "Ballet",
    family_key: "willie-winkie:t02:shkaf",
    family_canonical_title: "Двухдверный шкаф для одежды",
    price: 91000,
  }),
  ww({
    handle: "to-05-1",
    title: "Комод Tommy",
    motif_slug: "tommy",
    motif_title: "Tommy",
    family_key: "willie-winkie:t05:komod",
    family_canonical_title: "Комод",
    price: 44000,
  }),
]

assert.equal(motifCtaKind(1), "view_product")
assert.equal(motifCtaKind(2), "view_furniture")
assert.equal(motifCtaKind(3), "view_collection")
assert.equal(MOTIF_CTA_LABELS.view_product, "Посмотреть товар")
assert.equal(MOTIF_CTA_LABELS.view_furniture, "Посмотреть мебель")
assert.equal(MOTIF_CTA_LABELS.view_collection, "Посмотреть коллекцию")

{
  const themes = buildMotifThemes(sample)
  assert.equal(themes.length, 3)
  const templars = themes.find((t) => t.motif_slug === "templars")!
  assert.equal(templars.motif_available_family_count, 3)
  assert.equal(templars.motif_available_product_count, 3)
  assert.equal(templars.cta_kind, "view_collection")
  assert.equal(templars.cta_label, "Посмотреть коллекцию")
  assert.ok(templars.motif_cover?.includes("te-"))
  assert.equal(templars.preview_products.length, 3)
  assert.ok(templars.preview_products.every((p) => p.title !== "INTERNAL SOURCE TITLE"))
  assert.ok(templars.preview_products.every((p) => !("sku" in p)))
  assert.ok(templars.preview_products.every((p) => !("id" in p)))

  const ballet = themes.find((t) => t.motif_slug === "ballet")!
  assert.equal(ballet.motif_available_family_count, 2)
  assert.equal(ballet.cta_kind, "view_furniture")

  const tommy = themes.find((t) => t.motif_slug === "tommy")!
  assert.equal(tommy.motif_available_family_count, 1)
  assert.equal(tommy.cta_kind, "view_product")

  const leaks = assertBuyerSafeMotifPayload({ motif_themes: themes })
  assert.deepEqual(leaks, [], leaks.join(", "))
}

{
  const detail = buildMotifThemeDetail(sample, "templars")!
  assert.equal(detail.products.length, 3)
  assert.ok(detail.products.every((p) => p.motif_slug === "templars"))
  assert.equal(buildMotifThemeDetail(sample, "missing"), null)
  const leaks = assertBuyerSafeMotifPayload(detail)
  assert.deepEqual(leaks, [], leaks.join(", "))
}

{
  const matched = buildMotifContext({
    products: sample,
    handle: "te-05-1",
    motifQuery: "templars",
  })!
  assert.equal(matched.motif_status, "matched")
  assert.equal(matched.redirect_handle, null)
  assert.equal(matched.motif_options.length, 3) // same family: templars/ballet/tommy komod
  assert.ok(matched.motif_options.every((o) => o.product_handle !== ""))
  assert.equal(matched.related_products_in_motif.length, 2)
  assert.ok(
    matched.related_products_in_motif.every((p) => p.handle !== "te-05-1")
  )

  const redirect = buildMotifContext({
    products: sample,
    handle: "te-05-1",
    motifQuery: "ballet",
  })!
  assert.equal(redirect.motif_status, "redirect")
  assert.equal(redirect.redirect_handle, "ba-05-1")

  const unsupported = buildMotifContext({
    products: sample,
    handle: "te-05-1",
    motifQuery: "fairies",
  })!
  assert.equal(unsupported.motif_status, "unknown")

  // fairies not in sample → unknown; add fairies other family then unsupported
  const withFairies = [
    ...sample,
    ww({
      handle: "fa-01-1",
      title: "Кровать Fairies",
      motif_slug: "fairies",
      motif_title: "Fairies",
      family_key: "willie-winkie:t01:krovat",
      family_canonical_title: "Кровать",
    }),
  ]
  const unsupportedFamily = buildMotifContext({
    products: withFairies,
    handle: "te-05-1",
    motifQuery: "fairies",
  })!
  assert.equal(unsupportedFamily.motif_status, "unsupported")
  assert.equal(unsupportedFamily.redirect_handle, null)
  assert.equal(unsupportedFamily.selected_motif?.motif_slug, "templars")

  const absent = buildMotifContext({
    products: sample,
    handle: "te-05-1",
    motifQuery: null,
  })!
  assert.equal(absent.motif_status, "absent")
  assert.equal(absent.selected_motif?.motif_slug, "templars")

  const leaks = assertBuyerSafeMotifPayload(matched)
  assert.deepEqual(leaks, [], leaks.join(", "))
}

// Non-WW product → null context
assert.equal(
  buildMotifContext({
    products: [{ handle: "ol-01-1", title: "Oliver", metadata: { collection: "oliver" } }],
    handle: "ol-01-1",
    motifQuery: "templars",
  }),
  null
)

// Conflicting motif_key for same slug is dropped (fail-closed), first wins.
{
  const conflicted = [
    ...sample,
    ww({
      handle: "te-bad",
      title: "Bad Templars",
      motif_slug: "templars",
      motif_title: "Templars",
      motif_key: "ww-motif:templars-OTHER",
      family_key: "willie-winkie:t99:other",
      family_canonical_title: "Другое",
    }),
  ]
  const themes = buildMotifThemes(conflicted)
  const templars = themes.find((t) => t.motif_slug === "templars")!
  assert.equal(templars.motif_available_product_count, 3)
  assert.ok(!templars.preview_products.some((p) => p.handle === "te-bad"))
}

console.log("motif-theme.fidelity.test.ts: ok")
