/**
 * Guard: Woodright legal-page route wiring (`@/lib/legal/legal-content` +
 * `@/lib/legal/legal-route` is the single SoT - see `launch-config.fidelity.test.ts`
 * for owner-input-field and per-page-content coverage).
 *
 * This file focuses on what is unique to the merged buyer routes: every
 * buyer-facing legal route renders through the shared `LegalRoutePage` /
 * `legalPageMetadata` helper (no second legal SoT), the footer still links
 * the 5 buyer legal pages, and no legal-entity facts are invented anywhere.
 *
 *   yarn dlx tsx src/lib/legal-content.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_PAGE_IDS, buildLegalPage } from "./legal/legal-content"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// Buyer-facing routes wired into the footer today - keep footer links, per
// the public-launch-blockers merge resolution (footer links ship even while
// pages carry `incompleteForPublicLaunch: true`; do not present invented facts).
const FOOTER_LEGAL_SLUGS = ["privacy", "terms", "delivery", "payment", "returns"]

// Every id the shared legal SoT knows about, including main's offer/warranty
// (no footer link yet - unchanged from before this merge).
assert.deepEqual(
  [...LEGAL_PAGE_IDS].sort(),
  ["delivery", "offer", "payment", "privacy", "returns", "terms", "warranty"].sort()
)

for (const id of LEGAL_PAGE_IDS) {
  const page = buildLegalPage(id, {})
  assert.equal(page.id, id)
  assert.ok(page.title, `${id}: title required`)
  assert.ok(page.lead.length > 0, `${id}: lead required`)
  assert.ok(page.sections.length > 0, `${id}: at least one section required`)
  assert.equal(page.incompleteForPublicLaunch, true, `${id}: no owner input supplied -> incomplete`)
}

// Static wiring: each footer-linked route must use the shared LegalRoutePage
// helper (single SoT) - not a second bespoke legal component/module.
for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.match(page, /LegalRoutePage/, `${slug}/page.tsx must use LegalRoutePage`)
  assert.match(page, /legalPageMetadata/, `${slug}/page.tsx must use legalPageMetadata`)
  assert.match(page, new RegExp(`id="${slug}"`), `${slug}/page.tsx must load its own id`)
}

// Footer must still link to the 5 buyer legal pages after the merge.
const copy = read("src/lib/woodright-copy.ts")
for (const slug of FOOTER_LEGAL_SLUGS) {
  assert.match(copy, new RegExp(`href:\\s*"/${slug}"`), `footer must link to /${slug}`)
}

// No invented legal-entity facts in the SoT (values only ever come from env).
const src = read("src/lib/legal/legal-content.ts")
assert.doesNotMatch(src, /\bИНН\s*:\s*"\d/i, "must not hardcode an INN value")
assert.doesNotMatch(src, /\bОГРН\s*:\s*"\d/i, "must not hardcode an OGRN value")
assert.doesNotMatch(src, /lorem/i, "must not use lorem placeholder")

// The old flat legal-content.ts / legal-page-layout.tsx SoT must be gone -
// `@/lib/legal/*` is the only legal SoT after this merge.
for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.doesNotMatch(page, /@\/lib\/legal-content"/, `${slug}/page.tsx must not import the retired flat legal-content module`)
  assert.doesNotMatch(page, /@\/components\/legal-page-layout"/, `${slug}/page.tsx must not import the retired legal-page-layout component`)
}

console.log("legal-content.fidelity: ok")
