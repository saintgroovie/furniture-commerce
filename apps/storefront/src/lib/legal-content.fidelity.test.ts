/**
 * Guard: Woodright legal-content SoT (no invented legal facts, no approved
 * status until owner input lands).
 *
 *   yarn dlx tsx src/lib/legal-content.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  LEGAL_PAGES,
  allLegalStatuses,
  assertLegalApprovedForPublicIndexable,
  getLegalPage,
} from "./legal-content"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const EXPECTED_SLUGS = ["privacy", "terms", "delivery", "payment", "returns"]

assert.equal(LEGAL_PAGES.length, 5)
assert.deepEqual(
  LEGAL_PAGES.map((p) => p.slug),
  EXPECTED_SLUGS
)

for (const page of LEGAL_PAGES) {
  assert.ok(page.title, `${page.slug}: title required`)
  assert.ok(page.h1, `${page.slug}: h1 required`)
  assert.ok(page.description, `${page.slug}: description required`)
  assert.ok(page.sections.length > 0, `${page.slug}: at least one section required`)
  assert.notEqual(page.status, "approved", `${page.slug}: must not be pre-approved`)
  assert.ok(
    page.status === "draft" || page.status === "missing_owner_input",
    `${page.slug}: status must be draft|missing_owner_input, got "${page.status}"`
  )
  for (const section of page.sections) {
    assert.ok(section.title, `${page.slug}: section title required`)
    assert.ok(section.paragraphs.length > 0, `${page.slug}/${section.title}: paragraphs required`)
    for (const paragraph of section.paragraphs) {
      assert.ok(paragraph.trim().length > 0, `${page.slug}/${section.title}: empty paragraph`)
      // No em/en dash in RU UI copy (dash-typography.mdc).
      assert.doesNotMatch(paragraph, /[\u2013\u2014]/, `${page.slug}/${section.title}: em/en dash forbidden`)
      // No lorem placeholder text.
      assert.doesNotMatch(paragraph, /lorem/i, `${page.slug}/${section.title}: no lorem placeholder`)
    }
  }
}

// No invented legal-entity facts anywhere in the SoT file.
const src = read("src/lib/legal-content.ts")
assert.doesNotMatch(src, /\bИНН\b/i, "must not invent INN")
assert.doesNotMatch(src, /\bОГРН\b/i, "must not invent OGRN")
assert.doesNotMatch(src, /lorem/i, "must not use lorem placeholder")

// getLegalPage
assert.equal(getLegalPage("privacy").slug, "privacy")
assert.throws(() => getLegalPage("bogus" as never), /Unknown legal page slug/)

// allLegalStatuses
const statuses = allLegalStatuses()
assert.equal(Object.keys(statuses).length, 5)
for (const slug of EXPECTED_SLUGS) {
  assert.ok(slug in statuses, `${slug} missing from allLegalStatuses()`)
}

// assertLegalApprovedForPublicIndexable: must throw today (nothing approved).
assert.throws(assertLegalApprovedForPublicIndexable, /not approved for public_indexable/)

// Static wiring: the 5 legal routes must exist and render via LegalPageLayout.
for (const slug of EXPECTED_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.match(page, /LegalPageLayout/, `${slug}/page.tsx must use LegalPageLayout`)
  assert.match(page, new RegExp(`getLegalPage\\("${slug}"\\)`), `${slug}/page.tsx must load its own slug`)
}

// Footer must link to all 5 legal pages.
const copy = read("src/lib/woodright-copy.ts")
for (const slug of EXPECTED_SLUGS) {
  assert.match(copy, new RegExp(`href:\\s*"/${slug}"`), `footer must link to /${slug}`)
}

console.log("legal-content.fidelity: ok")
