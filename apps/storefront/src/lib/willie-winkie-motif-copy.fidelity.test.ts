/**
 * Buyer-facing Willie Winkie motif copy gates (owner review).
 *
 *   node_modules/.bin/tsx src/lib/willie-winkie-motif-copy.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { seo, willieWinkieMotifsCopy } from "./woodright-copy"

const LEGACY_EN = [
  "Willie Winkie",
  "Molly",
  "Tommy",
  "Ballet",
  "Fairies",
  "Templars",
  "Ant's Village",
]

function assertNoLegacyEnglish(label: string, value: string) {
  for (const en of LEGACY_EN) {
    assert.ok(
      !value.includes(en),
      `${label} must not contain buyer English «${en}»: ${value}`
    )
  }
}

assert.equal(willieWinkieMotifsCopy.productsOnlySubhead, "Доступны эти предметы")
assert.ok(!willieWinkieMotifsCopy.productsOnlySubhead.toLowerCase().includes("только"))
assert.ok(willieWinkieMotifsCopy.directoryH1.includes("Вилли Винки"))
assert.ok(willieWinkieMotifsCopy.directoryCrumb.includes("Вилли Винки"))
assert.ok(willieWinkieMotifsCopy.backToDirectoryShort === "Вилли Винки")
assertNoLegacyEnglish("directoryH1", willieWinkieMotifsCopy.directoryH1)
assertNoLegacyEnglish("seo.title", seo.willieWinkieMotifs.title)
assertNoLegacyEnglish("seo.description", seo.willieWinkieMotifs.description)

const mollySeo = seo.willieWinkieMotif("Молли")
assert.ok(mollySeo.title.includes("Молли"))
assert.ok(mollySeo.title.includes("Вилли Винки"))
assertNoLegacyEnglish("motif seo title", mollySeo.title)
assertNoLegacyEnglish("motif seo description", mollySeo.description)

// Call sites must not treat productsOnlySubhead as a function.
const detailPage = readFileSync(
  path.join(__dirname, "../app/kids/willie-winkie/[motifSlug]/page.tsx"),
  "utf8"
)
assert.ok(detailPage.includes("willieWinkieMotifsCopy.productsOnlySubhead"))
assert.ok(!detailPage.includes("productsOnlySubhead("))
assert.ok(detailPage.includes("willieWinkieMotifsCopy.backToDirectoryShort"))
assert.ok(!detailPage.includes(">Willie Winkie<"))

console.log("willie-winkie-motif-copy.fidelity.test.ts: ok")
