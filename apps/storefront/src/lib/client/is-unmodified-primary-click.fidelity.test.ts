/**
 * isUnmodifiedPrimaryClick fidelity.
 * Run: ../backend/node_modules/.bin/tsx src/lib/client/is-unmodified-primary-click.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { isUnmodifiedPrimaryClick } from "./is-unmodified-primary-click"

assert.equal(isUnmodifiedPrimaryClick({}), true)
assert.equal(isUnmodifiedPrimaryClick({ button: 0 }), true)
assert.equal(isUnmodifiedPrimaryClick({ button: 1 }), false)
assert.equal(isUnmodifiedPrimaryClick({ metaKey: true }), false)
assert.equal(isUnmodifiedPrimaryClick({ ctrlKey: true }), false)
assert.equal(isUnmodifiedPrimaryClick({ shiftKey: true }), false)
assert.equal(isUnmodifiedPrimaryClick({ altKey: true }), false)
assert.equal(
  isUnmodifiedPrimaryClick({ button: 0, metaKey: true }),
  false
)

console.log("is-unmodified-primary-click.fidelity.test.ts: ok")
