/**
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/greenwich-paint-media.fidelity.test.ts
 *   # or: npx tsx src/lib/greenwich-paint-media.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  isGreenwichDarkWoodAssetUrl,
  sanitizeGreenwichPaintMatrix,
  greenwichPaintMatrixFromProduct,
} from "./greenwich-paint-media"
import { toCatalogBrowseClientProduct } from "./catalog-browse-client-product"

const base = "/static/products/greenwich/"

assert.equal(
  isGreenwichDarkWoodAssetUrl(base + "GR-44-1_greenwich_darkblue07.jpg"),
  false,
  "darkblue paint on natural wood must not count as dark frame"
)
assert.equal(
  isGreenwichDarkWoodAssetUrl(base + "GR-44-1_greenwich_dark_darkblue07.jpg"),
  true,
  "dark_darkblue must count as dark frame"
)

{
  // Corrupted DB cell: natural + dark URLs merged under frame_material dark.
  const corrupted = [
    {
      frame_material: "dark",
      paint_finish: "darkblue",
      label: "Син-серый N436",
      urls: [
        base + "GR-44-1_greenwich_darkblue07_tynd-0c.jpg",
        base + "GR-44-1_greenwich_darkblue08_tt1q-et.jpg",
        base + "GR-44-1_greenwich_dark_darkblue07_kkao-jb.jpg",
        base + "GR-44-1_greenwich_dark_darkblue08_pcph-vm.jpg",
      ],
    },
  ]
  const fixed = sanitizeGreenwichPaintMatrix(corrupted)
  const frames = new Set(fixed.map((c) => c.frame_material))
  assert.equal(frames.has("natural"), true)
  assert.equal(frames.has("dark"), true)
  const natural = fixed.find((c) => c.frame_material === "natural")!
  const dark = fixed.find((c) => c.frame_material === "dark")!
  assert.equal(natural.urls.length, 2)
  assert.equal(dark.urls.length, 2)
  assert.ok(natural.urls.every((u) => !isGreenwichDarkWoodAssetUrl(u)))
  assert.ok(dark.urls.every((u) => isGreenwichDarkWoodAssetUrl(u)))
}

{
  // Catalog lean slim must run AFTER sanitize so both woods survive.
  const out = toCatalogBrowseClientProduct({
    id: "prod_gw44",
    handle: "greenwich-gr-44-1",
    title: "Консоль",
    thumbnail: base + "GR-44-1_greenwich_darkblue07_tynd-0c.jpg",
    metadata: {
      greenwich_paint_execution_matrix: [
        {
          frame_material: "dark",
          paint_finish: "darkblue",
          label: "Син-серый N436",
          urls: [
            base + "GR-44-1_greenwich_darkblue07_tynd-0c.jpg",
            base + "GR-44-1_greenwich_darkblue08_tt1q-et.jpg",
            base + "GR-44-1_greenwich_dark_darkblue07_kkao-jb.jpg",
            base + "GR-44-1_greenwich_dark_darkblue08_pcph-vm.jpg",
          ],
        },
      ],
      frame_material_executions: [
        { key: "natural", label: "Светлое дерево", urls: [], swatch_hex: "#d6cfc2" },
        { key: "dark", label: "Тёмное дерево", urls: [], swatch_hex: "#3a4038" },
      ],
      execution_dimension_contract:
        "paint_finish|frame_material|greenwich_paint_execution_matrix|shared_scene",
    },
    images: [],
    variants: [],
  })
  const matrix = (out.metadata as { greenwich_paint_execution_matrix: Array<{
    frame_material: string
    paint_finish: string
    urls: string[]
  }> }).greenwich_paint_execution_matrix
  assert.equal(matrix.length, 2)
  const nat = matrix.find((c) => c.frame_material === "natural")!
  const dark = matrix.find((c) => c.frame_material === "dark")!
  assert.equal(nat.urls.length, 2)
  assert.equal(dark.urls.length, 2)
  assert.ok(!isGreenwichDarkWoodAssetUrl(nat.urls[0]!))
  assert.ok(isGreenwichDarkWoodAssetUrl(dark.urls[0]!))

  const fromProduct = greenwichPaintMatrixFromProduct(out)
  const darkblueFrames = new Set(
    fromProduct
      .filter((c) => c.paint_finish === "darkblue")
      .map((c) => c.frame_material)
  )
  assert.equal(darkblueFrames.has("natural"), true)
  assert.equal(darkblueFrames.has("dark"), true)
}

{
  // Slimmed single natural URL wrongly labeled dark → natural-only chip.
  const slimWrong = sanitizeGreenwichPaintMatrix([
    {
      frame_material: "dark",
      paint_finish: "darkblue",
      label: "Син-серый N436",
      urls: [base + "GR-44-1_greenwich_darkblue07_tynd-0c.jpg"],
    },
  ])
  assert.equal(slimWrong.length, 1)
  assert.equal(slimWrong[0]!.frame_material, "natural")
}

console.log("greenwich-paint-media.fidelity.test.ts: ok")
