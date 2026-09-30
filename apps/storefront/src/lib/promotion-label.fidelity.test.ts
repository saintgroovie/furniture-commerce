/**
 * Promo eyebrow contract: blank means no badge.
 * Run via `yarn test:fidelity` from apps/storefront.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buyerPromotionLabel } from "./promotion-label"

assert.equal(buyerPromotionLabel(""), null)
assert.equal(buyerPromotionLabel("   "), null)
assert.equal(buyerPromotionLabel("\n\t"), null)
assert.equal(buyerPromotionLabel(null), null)
assert.equal(buyerPromotionLabel(undefined), null)
assert.equal(buyerPromotionLabel("Весна"), "Весна")
assert.equal(buyerPromotionLabel("  Весна  "), "Весна")
assert.equal(buyerPromotionLabel("Специальная цена"), "Специальная цена")

const here = path.dirname(new URL(import.meta.url).pathname)
const card = readFileSync(path.join(here, "../components/promotion-card.tsx"), "utf8")
const copy = readFileSync(path.join(here, "woodright-copy.ts"), "utf8")

assert.match(card, /buyerPromotionLabel\(slot\.slot\?\.label\)/)
assert.doesNotMatch(card, /defaultLabel/)
assert.doesNotMatch(card, /Специальная цена/)
assert.match(card, /\{label \? \(/)
assert.doesNotMatch(copy, /defaultLabel/)

console.log("promotion-label.fidelity.test.ts: ok")
