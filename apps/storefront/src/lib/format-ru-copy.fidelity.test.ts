/**
 * Narrow RU typography fidelity tests (no Next runtime).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/format-ru-copy.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { formatRuInline } from "./format-ru-copy"

function assertGlued(input: string, expectedChunk: string) {
  const out = formatRuInline(input)
  assert.ok(
    out.includes(expectedChunk),
    `expected ${JSON.stringify(expectedChunk)} in ${JSON.stringify(out)}`
  )
}

assertGlued(
  "Готовые предметы, детские коллекции и мебель под проект",
  "мебель\u00A0под\u00A0проект"
)
assertGlued("исполнений под проект", "исполнений\u00A0под\u00A0проект")
assertGlued("мебель по проекту", "мебель\u00A0по\u00A0проекту")
assertGlued("материалами под проект", "материалами\u00A0под\u00A0проект")
assertGlued("сборка под ключ", "под\u00A0ключ")
assertGlued(
  "для взрослых и детских комнат",
  "для\u00A0взрослых\u00A0и\u00A0детских\u00A0комнат"
)
assertGlued(
  "Готовые модели, комнаты целиком и работа по проекту",
  "комнаты\u00A0целиком\u00A0и\u00A0работа\u00A0по\u00A0проекту"
)
assertGlued("столы и стеллажи", "столы\u00A0и\u00A0стеллажи")

const hanging = formatRuInline("мебель в каталоге")
assert.ok(hanging.includes("в\u00A0каталоге"), hanging)

console.log("format-ru-copy.fidelity.test.ts: ok")
