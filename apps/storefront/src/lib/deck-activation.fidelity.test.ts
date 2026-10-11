/**
 * Deck overlay activation and history symmetry.
 *
 *   yarn dlx tsx src/lib/deck-activation.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deckHistoryState, isPlainDeckActivation, readDeckHistory } from "./deck-activation"

const plain = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: null as string | null,
}

assert.equal(isPlainDeckActivation(plain), true, "plain left click")
assert.equal(isPlainDeckActivation({ ...plain, metaKey: true }), false, "cmd click")
assert.equal(isPlainDeckActivation({ ...plain, ctrlKey: true }), false, "ctrl click")
assert.equal(isPlainDeckActivation({ ...plain, shiftKey: true }), false, "shift click")
assert.equal(isPlainDeckActivation({ ...plain, altKey: true }), false, "alt click")
assert.equal(isPlainDeckActivation({ ...plain, button: 1 }), false, "middle click")
assert.equal(isPlainDeckActivation({ ...plain, button: 2 }), false, "secondary click")
assert.equal(isPlainDeckActivation({ ...plain, defaultPrevented: true }), false, "already prevented")
assert.equal(isPlainDeckActivation({ ...plain, target: "_blank" }), false, "new tab target")
assert.equal(isPlainDeckActivation({ ...plain, target: "_self" }), true, "explicit self")

const opened = deckHistoryState("bolshoi", 2)
assert.deepEqual(opened, { pxDeck: true, slug: "bolshoi", index: 2 })

const stack: unknown[] = [null, opened]
let cursor = 1
const back = () => {
  cursor = Math.max(0, cursor - 1)
  return stack[cursor]
}
const forward = () => {
  cursor = Math.min(stack.length - 1, cursor + 1)
  return stack[cursor]
}

assert.equal(readDeckHistory(back()), null, "back closes")
assert.deepEqual(readDeckHistory(forward()), { slug: "bolshoi", index: 2 }, "forward restores")
assert.equal(readDeckHistory({ pxDeck: true }), null, "missing slug does not restore")
assert.equal(readDeckHistory(null), null)

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const editorial = readFileSync(join(srcRoot, "components/partners/partners-editorial.tsx"), "utf8")
const viewer = readFileSync(join(srcRoot, "components/partners/deck-viewer.tsx"), "utf8")

assert.match(editorial, /isPlainDeckActivation/)
assert.match(editorial, /deckHistoryState/)
assert.match(editorial, /readDeckHistory/)
assert.match(editorial, /popstate/)
assert.doesNotMatch(viewer, /pushState/)
assert.doesNotMatch(viewer, /history\.back\(\)[\s\S]{0,80}history\.back\(\)/)
const cleanup = viewer.slice(viewer.indexOf("return () => {"))
assert.doesNotMatch(cleanup.slice(0, cleanup.indexOf("}, [last, onClose])")), /history\.back\(/)

console.log("deck-activation.fidelity.test.ts: ok")
