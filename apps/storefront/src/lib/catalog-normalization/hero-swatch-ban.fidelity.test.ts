/**
 * Regression: ordinary fabric/finish texture tiles must never use product hero/mainSrc.
 * Legacy separateFabricRows may opt into allowHeroAsSwatch (controlled path only).
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
  gallerySrc.includes("allowHeroAsSwatch"),
  "gallery must keep controlled allowHeroAsSwatch option for legacy separateFabricRows"
)
assert.ok(
  gallerySrc.includes("Never treat"),
  "gallery must document that ordinary upholstery heroes are not fabric tiles"
)
assert.ok(
  gallerySrc.includes("const textureSrc = variant.swatchImageUrl?.trim() ?? \"\""),
  "textureSrc must come only from swatchImageUrl"
)
assert.ok(
  /legacyHeroSrc\s*=\s*options\.allowHeroAsSwatch/.test(gallerySrc),
  "hero fallback must be gated by allowHeroAsSwatch"
)
assert.ok(
  gallerySrc.includes("allowHeroAsSwatch: true"),
  "separateFabricRows path must explicitly opt into allowHeroAsSwatch"
)

/* Upholstery axis call must not pass allowHeroAsSwatch: true */
const upholsteryBlock = gallerySrc.match(
  /renderSwatchRow\(\s*"Обивка"[\s\S]{0,500}?\)/
)
assert.ok(upholsteryBlock, "Обивка renderSwatchRow must exist")
assert.equal(
  /allowHeroAsSwatch\s*:\s*true/.test(upholsteryBlock![0]),
  false,
  "Обивка axis must not enable allowHeroAsSwatch"
)

console.log("hero-swatch-ban fidelity: ok")
