/**
 * Admin buyer-preview fail-safe: malformed metadata must not throw.
 *   yarn dlx tsx src/lib/catalog-normalization/admin-buyer-preview-failsafe.fidelity.test.ts
 *
 * Runs from apps/backend (or storefront with relative import path adjusted).
 */
import assert from "node:assert/strict"
import { resolvePublicProductTitle } from "./public-title"
import { isMedusaStubOptionTitle } from "./option-taxonomy"
import {
  guardBuyerFacingTitle,
  guardExecutionSwatchRow,
} from "./import-guards"

function buildPreviewSafe(data: {
  id?: string
  title?: string
  handle?: string
  metadata?: Record<string, unknown>
  options?: Array<{ title?: string; values?: Array<{ value?: string }> }>
  variants?: Array<{ title?: string; sku?: string }>
}) {
  const resolved = resolvePublicProductTitle({
    title: data.title,
    handle: data.handle,
    metadata: data.metadata ?? null,
  })
  const options = (data.options ?? [])
    .filter((o) => o?.title && !isMedusaStubOptionTitle(o.title))
    .map((o) => ({
      title: o.title!,
      values: (o.values ?? [])
        .map((v) => v?.value)
        .filter((v): v is string => !!v && !isMedusaStubOptionTitle(v)),
    }))
    .filter((o) => o.values.length > 0)

  const meta = data.metadata ?? {}
  const execAxes: string[] = []
  for (const key of [
    "material_tiers",
    "finish_color_executions",
    "fabric_upholstery_executions",
  ]) {
    const v = meta[key]
    if (Array.isArray(v) && v.length) {
      const objects = v.filter((row) => row && typeof row === "object")
      execAxes.push(`${key}: ${objects.length}`)
    } else if (v && typeof v === "object") {
      execAxes.push(`${key}: object`)
    }
  }

  return {
    resolved,
    options,
    execAxes,
    stubFiltered: (data.options ?? []).some((o) =>
      isMedusaStubOptionTitle(o?.title ?? "")
    ),
  }
}

const malformed = buildPreviewSafe({
  id: "prod_test",
  title: "Стол",
  handle: "test-1",
  metadata: {
    public_title: "Стол письменный Provence",
    fabric_upholstery_executions: [
      null,
      "legacy-string-row",
      { key: "beige", label: "Бежевый", swatch_hex: "#c4b09a", presentation: "swatch_color" },
    ],
    finish_color_executions: undefined as unknown as unknown[],
  },
  options: [
    { title: "Default", values: [{ value: "Default Variant" }] },
    { title: "Размер", values: [{ value: "160×200" }] },
  ],
  variants: [{ title: "Default Variant", sku: "TEST-1" }],
})

assert.equal(malformed.resolved.public_title.includes("Provence"), true)
assert.equal(malformed.options.length, 1)
assert.equal(malformed.options[0]?.title, "Размер")
assert.equal(malformed.stubFiltered, true)
assert.ok(malformed.execAxes.some((a) => a.startsWith("fabric_upholstery_executions")))

assert.deepEqual(guardBuyerFacingTitle("Стол ЯП").map((f) => f.code), [
  "PEDESTAL_CODE_IN_PUBLIC_TITLE",
])
assert.equal(
  guardExecutionSwatchRow(
    { presentation: "swatch_image" },
    { path: "x" }
  )[0]?.code,
  "SWATCH_IMAGE_WITHOUT_ASSET"
)
assert.equal(
  guardExecutionSwatchRow(
    { presentation: "swatch_image", swatch_image: "/img/hero.jpg" },
    { heroUrls: ["/img/hero.jpg"] }
  )[0]?.code,
  "HERO_AS_SWATCH_URL"
)

console.log("admin-buyer-preview-failsafe fidelity: ok")
