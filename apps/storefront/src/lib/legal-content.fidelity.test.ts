/**
 * Guard: Woodright legal-page route wiring (`@/lib/legal/legal-content` +
 * `@/lib/legal/legal-route` is the single SoT - see `launch-config.fidelity.test.ts`
 * for owner-input-field coverage).
 *
 *   yarn dlx tsx src/lib/legal-content.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_PAGE_IDS, buildLegalPage } from "./legal/legal-content"
import { woodrightSeller } from "./legal/woodright-seller"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const FOOTER_LEGAL_SLUGS = [
  "privacy",
  "terms",
  "delivery",
  "payment",
  "returns",
  "warranty",
  "offer",
  "requisites",
  "cookies",
]

assert.deepEqual(
  [...LEGAL_PAGE_IDS].sort(),
  [
    "cookies",
    "delivery",
    "offer",
    "payment",
    "personal-data",
    "privacy",
    "requisites",
    "returns",
    "terms",
    "warranty",
  ].sort()
)

for (const id of LEGAL_PAGE_IDS) {
  const page = buildLegalPage(id)
  assert.equal(page.id, id)
  assert.ok(page.title, `${id}: title required`)
  assert.doesNotMatch(page.title, /подготовка|черновик|Публичная оферта/i, `${id}: no stub or unapproved-offer title`)
  assert.ok(page.lead.length > 0, `${id}: lead required`)
  assert.ok(page.sections.length > 0, `${id}: at least one section required`)
  assert.equal(page.incompleteForPublicLaunch, true, `${id}: legal pack not owner-approved -> incomplete flag`)
}

assert.equal(buildLegalPage("offer").title, "Условия продажи")

for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.match(page, /LegalRoutePage/, `${slug}/page.tsx must use LegalRoutePage`)
  assert.match(page, /legalPageMetadata/, `${slug}/page.tsx must use legalPageMetadata`)
  assert.match(page, new RegExp(`id="${slug}"`), `${slug}/page.tsx must load its own id`)
}

const personalDataPage = read("src/app/personal-data/page.tsx")
assert.match(personalDataPage, /LegalRoutePage/)
assert.match(personalDataPage, /id="personal-data"/)

const copy = read("src/lib/woodright-copy.ts")
for (const slug of FOOTER_LEGAL_SLUGS) {
  assert.match(copy, new RegExp(`href:\\s*"/${slug}"`), `footer must link to /${slug}`)
}

const sellerSrc = read("src/lib/legal/woodright-seller.ts")
assert.match(sellerSrc, new RegExp(woodrightSeller.inn))
assert.match(sellerSrc, new RegExp(woodrightSeller.ogrn))
assert.doesNotMatch(sellerSrc, /40702810|30101810|047003608/)

const legalSrc = read("src/lib/legal/legal-content.ts")
assert.doesNotMatch(legalSrc, /\bИНН\s*:\s*"\d/)
assert.doesNotMatch(legalSrc, /lorem/i)
assert.doesNotMatch(legalSrc, /Публичная оферта/)
assert.doesNotMatch(legalSrc, /Демо Магазин|demostore/i)

for (const slug of FOOTER_LEGAL_SLUGS) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.doesNotMatch(page, /@\/lib\/legal-content"/)
  assert.doesNotMatch(page, /@\/components\/legal-page-layout"/)
}

console.log("legal-content.fidelity: ok")
