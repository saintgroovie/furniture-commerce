/**
 *   ../backend/node_modules/.bin/tsx src/lib/buyer-finish-label.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { formatBuyerFacingFinishLabel } from "./buyer-finish-label"

assert.equal(formatBuyerFacingFinishLabel("linda"), "Linda")
assert.equal(formatBuyerFacingFinishLabel("lorna"), "Lorna")
assert.equal(formatBuyerFacingFinishLabel("torno"), "Torno")
assert.equal(formatBuyerFacingFinishLabel("  oak "), "Oak")
assert.equal(formatBuyerFacingFinishLabel(""), "")

console.log("buyer-finish-label.fidelity.test.ts: ok")
