/**
 * Catalog normalization — public title + pedestal + presentation fidelity.
 *   yarn dlx tsx src/lib/catalog-normalization/public-title.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  expandPedestalDeskCodeInTitle,
  extractPedestalDeskCode,
  PEDESTAL_DESK_CODE_MAP,
  resolvePublicProductTitle,
  extractLatinModelName,
  isMedusaStubOptionTitle,
} from "./index"
import { annotateExecutionPresentations } from "../../../../backend/src/lib/catalog-normalization/annotate-presentations"

{
  assert.equal(extractPedestalDeskCode("Стол письменный 2-тумб. ЯП"), "ЯП")
  const r = expandPedestalDeskCodeInTitle("Стол письменный 2-тумб. ЯП")
  assert.equal(r.changed, true)
  assert.match(r.title, /ящики слева, полки справа/)
  assert.doesNotMatch(r.title, /ЯП\s*$/)
  assert.doesNotMatch(r.title, /дверц/)
  assert.equal(PEDESTAL_DESK_CODE_MAP.ЯП.confidence, "VERIFIED")
  assert.equal(PEDESTAL_DESK_CODE_MAP.ПП.confidence, "VERIFIED")
  assert.equal(PEDESTAL_DESK_CODE_MAP.ПП.public_phrase, "полки с обеих сторон")
}

{
  assert.match(expandPedestalDeskCodeInTitle("Стол ПЯ").title, /полки слева/)
  assert.match(expandPedestalDeskCodeInTitle("Стол ЯЯ").title, /ящики с обеих сторон/)
  assert.match(expandPedestalDeskCodeInTitle("Стол ПП").title, /полки с обеих сторон/)
}

{
  const r = resolvePublicProductTitle({
    title: "Комод",
    metadata: { canonical_name: "Комод Scale" },
  })
  assert.equal(r.public_title, "Комод Scale")
  assert.equal(r.source, "merged_title_canonical")
}

{
  const r = resolvePublicProductTitle({
    title: "Гардероб 2-дв. с ящиками",
    metadata: { canonical_name: "Гардероб Level" },
  })
  assert.equal(r.public_title, "Гардероб 2-дв. с ящиками Level")
  assert.equal(r.source, "merged_title_canonical")
}

{
  const r = resolvePublicProductTitle({
    handle: "pv-66-7",
    title: "Стол письменный 2-тумб. ЯП",
    metadata: { canonical_name: "Стол письменный 2-тумб. ЯП" },
  })
  assert.equal(r.pedestal_code, "ЯП")
  assert.match(r.public_title, /ящики слева, полки справа/)
  assert.match(r.public_title, /двухтумбовый/)
  assert.match(r.public_title, /Provence/)
}

{
  const r = resolvePublicProductTitle({
    handle: "ol-66-1",
    title: "Стол письменный двухтумбовый Oliver (дверцы с обеих сторон)",
    metadata: {
      public_title: "Стол письменный двухтумбовый Oliver (дверцы с обеих сторон)",
      pedestal_filling: { left: "SHELVES", right: "SHELVES", legacy_code: "ПП" },
    },
  })
  assert.match(r.public_title, /полки с обеих сторон/)
  assert.doesNotMatch(r.public_title, /дверц/)
}

{
  const r = resolvePublicProductTitle({
    handle: "greenwich-gr-26-1",
    title: "Шкаф-витрина Кристалл",
    metadata: { canonical_name: "Шкаф-витрина Cristal" },
  })
  assert.equal(r.public_title, "Шкаф-витрина Кристалл")
  assert.ok(r.notes.includes("skip_merge_title_has_model"))
}

{
  const r = resolvePublicProductTitle({
    title: "Комод",
    metadata: {
      public_title: "Комод Scale",
      canonical_name: "Комод Scale",
    },
  })
  assert.equal(r.source, "metadata.public_title")
  assert.equal(r.public_title, "Комод Scale")
}

{
  const r = resolvePublicProductTitle({
    title: "Комод высокий Fairies",
    metadata: {
      source_title: "Комод высокий Fairies (гл. 560)",
    },
  })
  assert.equal(r.public_title, "Комод высокий Fairies")
  assert.equal(r.legacy_title, "Комод высокий Fairies")
  assert.doesNotMatch(r.public_title, /560/)
  assert.doesNotMatch(r.legacy_title ?? "", /560/)
}

{
  assert.equal(extractLatinModelName("Кровать GR-09-1"), null)
  assert.equal(extractLatinModelName("Консоль Step"), "Step")
}

{
  assert.equal(isMedusaStubOptionTitle("Default"), true)
  assert.equal(isMedusaStubOptionTitle("Обивка"), false)
}

{
  const { metadata, report } = annotateExecutionPresentations({
    fabric_upholstery_executions: [
      { key: "beige", label: "Бежевый", urls: [], swatch_hex: "#C4A574" },
      "legacy-string-row",
    ],
  })
  assert.equal(report.changed, true)
  assert.equal(report.rows_preserved_non_object, 1)
  const rows = metadata.fabric_upholstery_executions as unknown[]
  assert.equal(rows[1], "legacy-string-row")
  const row = rows[0] as Record<string, unknown>
  assert.equal(row.presentation, "swatch_color")
  assert.equal(row.semantic_type, "upholstery")

  const second = annotateExecutionPresentations(metadata)
  assert.equal(second.report.changed, false)
}

{
  /* Mixed axis: texture only when swatchImageUrl present — contract unit */
  const { metadata } = annotateExecutionPresentations({
    fabric_upholstery_executions: [
      { key: "a", label: "A", urls: [], swatch_hex: "#111111" },
      {
        key: "b",
        label: "B",
        urls: [],
        swatch_image: "/static/swatches/b.jpg",
      },
    ],
  })
  const rows = metadata.fabric_upholstery_executions as Array<Record<string, unknown>>
  assert.equal(rows[0]!.presentation, "swatch_color")
  assert.equal(rows[1]!.presentation, "swatch_image")
}

console.log("catalog-normalization public-title fidelity: ok")
