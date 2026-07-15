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
