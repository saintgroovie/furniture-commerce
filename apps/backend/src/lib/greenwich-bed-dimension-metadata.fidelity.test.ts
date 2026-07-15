/**
 * Builder: matrix cells must not include unscoped headboard pool or foreign combos.
 * Run from apps/backend:
 *   yarn node --import tsx src/lib/greenwich-bed-dimension-metadata.fidelity.test.ts
 *   (or: ../backend/node_modules/.bin/tsx from storefront — use local tsx)
 */
import assert from "node:assert/strict"
import { buildGreenwichBedDimensionBundle } from "./greenwich-bed-dimension-metadata"

const urls = [
  "/static/products/greenwich/beds/greenwich_frame_natural_beige.jpg",
  "/static/products/greenwich/beds/greenwich_frame_dark_beige.jpg",
  "/static/products/greenwich/beds/greenwich_frame_natural_darkblue.jpg",
  "/static/products/greenwich/beds/greenwich_frame_dark_darkblue.jpg",
  "/static/products/greenwich/beds/GR-BED-POOL_frame_01.jpg",
  "/static/products/greenwich/beds/GR-BED-POOL_frame_02.jpg",
  "/static/products/greenwich/beds/greenwich_cloud_natural_beige.jpg",
  "/static/products/greenwich/beds/greenwich_cloud_dark_beige.jpg",
  "/static/products/greenwich/beds/greenwich_cloud_natural_darkblue.jpg",
  "/static/products/greenwich/beds/greenwich_cloud_dark_darkblue.jpg",
  "/static/products/greenwich/beds/GR-BED-POOL_cloud_09.jpg",
  "/static/products/greenwich/beds/greenwich_plane_natural_beige.jpg",
  "/static/products/greenwich/beds/greenwich_plane_dark_beige.jpg",
  "/static/products/greenwich/beds/greenwich_plane_natural_darkblue.jpg",
  "/static/products/greenwich/beds/greenwich_plane_dark_darkblue.jpg",
  "/static/products/greenwich/beds/GR-BED-POOL_plane_17.jpg",
  "/static/products/greenwich/beds-shared/bedroom1_int_view.jpg",
]

const bundle = buildGreenwichBedDimensionBundle(urls)

assert.ok(bundle.bed_execution_matrix.length >= 12, "expected full combo grid")

for (const cell of bundle.bed_execution_matrix) {
  const files = cell.urls.map((u) => (u.split("/").pop() ?? u).toLowerCase())
  assert.equal(files[0]?.includes(cell.combo_key), true, `hero must match ${cell.combo_key}`)
  for (const f of files) {
    assert.ok(!/gr-bed-pool_/.test(f), `pool must not be in cell: ${f}`)
    const m = f.match(/(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/)
    if (m) assert.equal(m[1], cell.combo_key, `foreign combo in cell: ${f}`)
  }
}

assert.ok(
  bundle.shared_scene_media.some((s) => s.scene_type === "interior"),
  "interiors in shared_scene_media"
)
assert.ok(
  bundle.gallery_urls.some((u) => /gr-bed-pool_frame_01/i.test(u)),
  "pool still in flat gallery_urls"
)
assert.ok(
  bundle.gallery_urls.some((u) => /bedroom1_int_view/i.test(u)),
  "interior in flat gallery_urls"
)

console.log("greenwich-bed-dimension-metadata.fidelity.test.ts: ok")
