/**
 * Upholstery («Обивка») must render curated color chips, not product thumbnails.
 * Greenwich bed matrix may attach whole-bed heroes to fabric variants — those
 * must never become image swatches. Fabric closeups stay on separateFabricRows.
 *
 * Prior fix: Fable (transcript 38815016); must not regress.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/upholstery-swatch-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const corePath = path.resolve(
  here,
  "../components/product-card-media-gallery-core.tsx"
)
const core = readFileSync(corePath, "utf8")

const upholsteryCall = core.match(
  /showVisibleUpholstery &&\s*renderSwatchRow\([\s\S]*?\)\s*\}/
)
assert.ok(upholsteryCall, "expected Обивка renderSwatchRow call")
assert.equal(
  /imageSwatches\s*:\s*true/.test(upholsteryCall[0]!),
  false,
  "Обивка row must not force imageSwatches (bed thumbs regression)"
)

assert.match(
  core,
  /variant\.swatchHex\?\.trim\(\)\s*\|\|/,
  "fillColor must prefer curated swatchHex over sampled pixels"
)

assert.match(
  core,
  /showSeparateFabricRows[\s\S]{0,400}imageSwatches:\s*true/,
  "separateFabricRows may still use fabric closeup image swatches"
)

assert.match(
  core,
  /useSwatchColors\([\s\S]*?\{ enabled: false \}\s*\)/,
  "catalog and PDP must use metadata/token swatches without Image sampling"
)
assert.equal(
  /useSwatchColors\([\s\S]*?enabled:\s*cardStripProbeEnabled/.test(core),
  false,
  "useSwatchColors must not enable Image sampling via cardStripProbeEnabled"
)

console.log("upholstery-swatch-contract.fidelity.test.ts: ok")
