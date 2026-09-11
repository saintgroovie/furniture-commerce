/**
 * Invert-plate CTAs (home / kids / bespoke final) must keep a cream fill on
 * hover. `.btn-primary:hover:not(:disabled)` is more specific than a lone
 * `.hp-final-btn:hover` and paints action-hover onto the photo/olive band,
 * so the label disappears.
 *
 *   yarn dlx tsx src/lib/invert-cta-hover.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"),
  "utf8"
)

function ruleAfter(marker: string, max = 360): string {
  const i = css.indexOf(marker)
  assert.ok(i >= 0, `missing CSS marker ${marker}`)
  return css.slice(i, i + max)
}

const linkBtn = ruleAfter("a.btn,\na.btn:hover,\na.btn:focus-visible")
assert.match(linkBtn, /text-decoration:\s*none/)

for (const sel of [
  "a.btn.hp-final-btn:hover:not(:disabled)",
  ".hp-final-btn.btn-primary:hover:not(:disabled)",
  "a.btn.hp-kfinal-btn:hover:not(:disabled)",
  ".hp-kfinal-btn.btn-primary:hover:not(:disabled)",
  "a.btn.bsp-final-btn:hover:not(:disabled)",
]) {
  assert.ok(css.includes(sel), `missing invert hover selector ${sel}`)
}

const finalHover = ruleAfter(".hp-final-btn.btn-primary:hover:not(:disabled)")
assert.match(finalHover, /background:\s*#fff/)
assert.match(finalHover, /color:\s*var\(--color-brand-hover\)/)
assert.doesNotMatch(finalHover, /var\(--color-action-hover\)/)

const kidsHover = ruleAfter(".hp-kfinal-btn.btn-primary:hover:not(:disabled)")
assert.match(kidsHover, /background:\s*#fff/)
assert.match(kidsHover, /color:\s*#2f4534/)
assert.doesNotMatch(kidsHover, /var\(--color-action-hover\)/)

const bspHover = ruleAfter("a.btn.bsp-final-btn:hover:not(:disabled)")
assert.match(bspHover, /background:\s*#fff/)
assert.match(bspHover, /color:\s*var\(--bespoke-teal/)

console.log("invert-cta-hover.fidelity.test.ts: ok")
