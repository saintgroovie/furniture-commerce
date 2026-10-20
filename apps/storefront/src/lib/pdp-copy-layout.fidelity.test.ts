/**
 * PDP description layout fidelity (no Next runtime).
 * Run from apps/storefront:
 *   npx tsx src/lib/pdp-copy-layout.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  layoutDescriptionMeaningLines,
  layoutPdpDescription,
  normalizeRuUiDashes,
} from "./pdp-copy-layout"

assert.equal(
  normalizeRuUiDashes("зона у окна, - где нужна поверхность"),
  "зона у окна - где нужна поверхность"
)
assert.equal(
  normalizeRuUiDashes("на 90-сантиметровом матрасе, в светло-серой обивке; Кровать-трансформер, Оксфорд-1"),
  "на 90-сантиметровом матрасе, в светло-серой обивке; Кровать-трансформер, Оксфорд-1",
  "hyphens inside words and numbers are not dashes"
)
assert.equal(normalizeRuUiDashes("Москва—принимаем"), "Москва - принимаем")
assert.equal(normalizeRuUiDashes("Комод Oliver — 132 см"), "Комод Oliver - 132 см")
assert.equal(normalizeRuUiDashes("высота -90 см"), "высота - 90 см")
assert.equal(normalizeRuUiDashes("слово- слово"), "слово - слово")

const step = layoutDescriptionMeaningLines(
  "Её место - проходные зоны: прихожая, простенок, зона у окна, - где нужна поверхность для ключей, цветов или зарядки, но нет глубины под полноценный стол."
)
assert.deepEqual(step, [
  "Её место - проходные зоны: прихожая, простенок, зона у окна,",
  "где нужна поверхность для ключей, цветов или зарядки,",
  "но нет глубины под полноценный стол.",
])

const nested = layoutPdpDescription(
  "Консоль Степ - узкая консоль.\n\nЕё место - проходные зоны: прихожая, простенок, зона у окна, - где нужна поверхность для ключей, цветов или зарядки, но нет глубины под полноценный стол."
)
assert.equal(nested.length, 2)
assert.deepEqual(nested[1]?.[0], step)

/* Plain sentence stays one line. */
assert.deepEqual(
  layoutDescriptionMeaningLines("Высота 90 см удобна для пользования стоя."),
  ["Высота 90 см удобна для пользования стоя."]
)

console.log("pdp-copy-layout.fidelity.test.ts: ok")
