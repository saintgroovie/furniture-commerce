/**
 * Fidelity: historical /bespoke/catalog is not a public catalog journey.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const dir = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(dir, "page.tsx"), "utf8")

describe("bespoke catalog route", () => {
  it("permanently redirects to the Bespoke hub", () => {
    assert.match(page, /permanentRedirect/)
    assert.match(page, /["']\/bespoke["']/)
    assert.doesNotMatch(page, /bespokeCatalogCopy/)
    assert.doesNotMatch(page, /ProductCard/)
  })
})
