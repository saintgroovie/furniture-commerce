/**
 * Run: npx --yes tsx src/lib/provence-evidence-handle.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { provenceEvidenceHandle } from "./provence-finish-execution-guard"
import { withVariantCapabilities } from "./sparse-variant-map"

const view = withVariantCapabilities(
  { handle: "pv-14-1", title: "Кровать Прованс", metadata: {} },
  {
    sku: "PV-15-2",
    metadata: {
      gallery_urls: ["http://127.0.0.1:9211/static/products/provence/PV-15-2_gallery_02.jpg"],
    },
  }
)
assert.equal(view.handle, "pv-14-1")
assert.equal(provenceEvidenceHandle(view), "pv-15-2")

const cta = readFileSync(join(process.cwd(), "src/components/product-cta.tsx"), "utf8")
const start = cta.indexOf("function requestQuery")
const end = cta.indexOf("function bespokeRequestHref")
assert.ok(start >= 0 && end > start)
const requestQuery = cta.slice(start, end)
assert.match(requestQuery, /params\.set\("sku", sku\)/)

console.log("provence-evidence-handle.fidelity.test.ts: ok")
