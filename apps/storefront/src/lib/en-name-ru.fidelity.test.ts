/**
 * Buyer-facing EN→RU names: Willie Winkie motifs must use canonical labels.
 *
 *   yarn dlx tsx src/lib/en-name-ru.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { layoutBuyerFacingTitle, transcribeEnNamesInRuText } from "./en-name-ru"

assert.equal(transcribeEnNamesInRuText("Ballet"), "Балет")
assert.doesNotMatch(transcribeEnNamesInRuText("Ballet"), /Баллет/)
assert.equal(transcribeEnNamesInRuText("Teddy Bear"), "Плюшевый мишка")
assert.equal(transcribeEnNamesInRuText("Pastoral"), "Пастораль")

const leftover = layoutBuyerFacingTitle("Стеллаж для книг Ballet (гл. 440)")
assert.doesNotMatch(leftover.text, /Баллет/)
assert.match(leftover.text, /Балет/)

const cleaned = layoutBuyerFacingTitle("Стеллаж для книг")
assert.equal(cleaned.text, "Стеллаж для книг")

console.log("en-name-ru.fidelity.test.ts: ok")
