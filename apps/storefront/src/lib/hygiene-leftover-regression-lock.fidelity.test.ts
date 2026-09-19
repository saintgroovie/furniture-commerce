/**
 * Source locks for leftover WIP that must not land as-is.
 * C2 stuck veil / C3 closed-front + buyer title.
 *
 *   yarn exec tsx src/lib/hygiene-leftover-regression-lock.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const veil = readFileSync(join(root, "lib/route-veil.tsx"), "utf8")
assert.match(veil, /Keep polling while the fallback exists/)
assert.match(veil, /document\.querySelector\("\.route-loading-fallback"\)/)
assert.match(veil, /window\.setTimeout\(tick, 50\)/)
assert.match(veil, /VEIL_IMAGE_WAIT_CAP_MS \+ 2000/)
assert.match(
  veil,
  /img\.complete && img\.naturalWidth === 0 && img\.naturalHeight === 0/
)
assert.doesNotMatch(veil, /function incompleteAtf/)
assert.doesNotMatch(veil, /function decodeSoon/)

const card = readFileSync(join(root, "components/product-card.tsx"), "utf8")
assert.match(card, /cardThumbnailSrcFromProduct/)
assert.match(card, /getBuyerFacingProductTitle/)
assert.doesNotMatch(
  card,
  /displayGroup && typeof product\.title === "string"/
)

const promo = readFileSync(join(root, "components/promotion-card.tsx"), "utf8")
assert.match(promo, /material_execution_code/)
assert.match(promo, /priceFrom/)

console.log("hygiene-leftover-regression-lock.fidelity.test.ts: ok")
