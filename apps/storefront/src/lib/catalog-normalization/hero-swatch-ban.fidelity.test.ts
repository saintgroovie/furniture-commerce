/**
 * Regression: fabric/finish texture tiles must never use product hero/mainSrc.
 *   yarn dlx tsx src/lib/catalog-normalization/hero-swatch-ban.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const gallerySrc = readFileSync(
  join(
    process.cwd(),
    "src/components/product-card-media-gallery-core.tsx"
  ),
  "utf8"
)

assert.ok(
  gallerySrc.includes("Texture tiles ONLY from explicit swatchImageUrl"),
  "gallery must document explicit-swatch-only contract"
)
assert.ok(
  gallerySrc.includes("const imageSrc = variant.swatchImageUrl?.trim() ?? \"\""),
  "imageSrc must come only from swatchImageUrl"
)
assert.equal(
  /imageSrc\s*=\s*[\s\S]{0,200}variant\.mainSrc/.test(gallerySrc),
  false,
  "imageSrc must not fall back to variant.mainSrc"
)
assert.equal(
  /imageSrc\s*=\s*[\s\S]{0,200}sampled\?\.imageUrl/.test(gallerySrc),
  false,
  "imageSrc must not fall back to sampled product imagery"
)

console.log("hero-swatch-ban fidelity: ok")
