/**
 * Fidelity: bespoke catalog empty state keeps structured copy + CTA group.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const dir = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(dir, "page.tsx"), "utf8")
const copy = readFileSync(
  join(dir, "../../../lib/woodright-copy.ts"),
  "utf8"
)

describe("bespoke catalog empty fidelity", () => {
  it("does not flatten emptyBody array into a single <p>", () => {
    assert.doesNotMatch(page, /<p>\{\s*bespokeCatalogCopy\.emptyBody\s*\}<\/p>/)
    assert.match(page, /CopyLines/)
    assert.match(page, /bespoke-catalog-empty-actions/)
    assert.match(page, /btn btn-primary/)
    assert.match(page, /btn btn-secondary/)
  })

  it("keeps empty copy as separate meaning lines with restored dash", () => {
    assert.match(
      copy,
      /emptyBody:\s*\[[\s\S]*Позиции скоро появятся[\s\S]*Опишите задачу - соберём решение под вас/
    )
  })
})
