/**
 * Fidelity: homepage hero uses JS double-buffer, not CSS opacity cycle.
 *
 *   cd apps/storefront && node --test src/components/home/home-hero-slideshow.fidelity.test.mjs
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const dir = dirname(fileURLToPath(import.meta.url))
const slideshow = readFileSync(join(dir, "home-hero-slideshow.tsx"), "utf8")
const css = readFileSync(
  join(dir, "../../app/globals.css"),
  "utf8"
)

describe("home-hero-slideshow fidelity", () => {
  it("preloads/decodes next slide before crossfade", () => {
    assert.match(slideshow, /img\.decode|decode\(\)/)
    assert.match(slideshow, /new window\.Image/)
    assert.match(slideshow, /HOLD_MS|CROSSFADE_MS/)
    assert.match(slideshow, /data-active/)
  })

  it("does not use CSS keyframe opacity cycle for hero", () => {
    assert.doesNotMatch(slideshow, /hp-hero-cycle/)
    assert.doesNotMatch(css, /@keyframes\s+hp-hero-cycle/)
    assert.match(css, /\.hp-hero-img\[data-active="true"\]/)
  })

  it("keeps reduced-motion path without autoplay advance", () => {
    assert.match(slideshow, /prefers-reduced-motion:\s*reduce/)
  })
})
