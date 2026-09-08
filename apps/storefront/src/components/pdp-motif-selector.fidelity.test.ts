/**
 * Motif option cards: selected state must not change geometry.
 *
 *   yarn dlx tsx src/components/pdp-motif-selector.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const css = readFileSync(join(root, "src/app/globals.css"), "utf8")
const tsx = readFileSync(join(root, "src/components/pdp-motif-selector.tsx"), "utf8")

const optionBlock = css.slice(
  css.indexOf(".pdp-motif-option {"),
  css.indexOf(".pdp-motif-option-media")
)
assert.match(optionBlock, /border:\s*1\.5px solid/)
assert.doesNotMatch(optionBlock, /box-shadow:\s*inset/)
assert.match(css, /\.pdp-motif-option\.is-selected \{[\s\S]*?border-color:\s*var\(--ww-olive/)
assert.doesNotMatch(
  css,
  /\.pdp-motif-option\.is-selected \{[\s\S]*?box-shadow:\s*inset/
)
assert.match(css, /\.pdp-motif-option-title \{[\s\S]*?min-height:\s*2\.5em/)
assert.match(css, /\.pdp-motif-all-link--row \{[\s\S]*?text-align:\s*center/)
assert.match(css, /\.pdp-motif-all-link--row \{[\s\S]*?margin-inline:\s*auto/)
assert.match(css, /\.pdp-motif-all-link--row \{[\s\S]*?width:\s*fit-content/)

assert.match(tsx, /<button/)
assert.doesNotMatch(
  tsx,
  /if \(option\.selected\) \{[\s\S]*<span[\s\S]*pdp-motif-option/
)
assert.match(tsx, /pdp-motif-all-link--row/)
assert.match(tsx, /aria-pressed=\{option\.selected\}/)

console.log("pdp-motif-selector.fidelity.test.ts: ok")
