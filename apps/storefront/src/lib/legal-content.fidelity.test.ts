/**
 * Guard: Woodright legal-page route wiring + footer + no invented entity facts.
 *
 *   yarn dlx tsx src/lib/legal-content.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { LEGAL_PAGE_IDS, buildLegalPage } from "./legal/legal-content"
import { LEGAL_DOCUMENT_META } from "./legal/legal-status"
import { evaluateLegalStatusForPublicLaunch } from "./legal/legal-status"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const FOOTER_LEGAL_SLUGS = [
  "delivery",
  "payment",
  "returns",
  "warranty",
  "privacy",
  "personal-data",
  "cookies",
  "terms",
  "offer",
  "requisites",
  "contacts",
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

assert.equal(LEGAL_DOCUMENT_META.status, "owner_review")
assert.equal(LEGAL_DOCUMENT_META.approvalId, null)

for (const id of LEGAL_PAGE_IDS) {
  const page = buildLegalPage(id, {})
  assert.equal(page.id, id)
  assert.ok(page.title, `${id}: title required`)
  assert.doesNotMatch(page.title, /подготовка|черновик/i, `${id}: no prep chrome in title`)
  assert.ok(page.lead.length > 0, `${id}: lead required`)
  assert.ok(page.sections.length > 0, `${id}: at least one section required`)
  assert.equal(page.incompleteForPublicLaunch, true, `${id}: no owner input -> incomplete`)
  const blob = [page.title, ...page.lead, ...page.sections.flatMap((s) => s.paragraphs)].join("\n")
  assert.doesNotMatch(blob, /\bTBD\b/i, `${id}: no TBD`)
  assert.doesNotMatch(blob, /lorem/i, `${id}: no lorem`)
}

for (const slug of [
  "privacy",
  "terms",
  "delivery",
  "payment",
  "returns",
  "offer",
  "warranty",
  "cookies",
  "personal-data",
  "requisites",
]) {
  const page = read(`src/app/${slug}/page.tsx`)
  assert.match(page, /LegalRoutePage/, `${slug}/page.tsx must use LegalRoutePage`)
  assert.match(page, /legalPageMetadata/, `${slug}/page.tsx must use legalPageMetadata`)
}

const copy = read("src/lib/woodright-copy.ts")
for (const slug of FOOTER_LEGAL_SLUGS) {
  assert.match(copy, new RegExp(`href:\\s*"/${slug}"`), `footer must link to /${slug}`)
}

const src = read("src/lib/legal/legal-content.ts")
assert.doesNotMatch(src, /\bИНН\s*:\s*"\d/i, "must not hardcode an INN value")
assert.doesNotMatch(src, /\bОГРН\s*:\s*"\d/i, "must not hardcode an OGRN value")

const gate = evaluateLegalStatusForPublicLaunch(LEGAL_DOCUMENT_META, "owner_review")
assert.equal(gate.ok, false)
assert.ok(gate.blockers.length > 0)
const gateInvalid = evaluateLegalStatusForPublicLaunch(
  { ...LEGAL_DOCUMENT_META, status: "approved", approvalId: "x", approvedSha: "y" },
  "approvd"
)
assert.equal(gateInvalid.ok, false)
assert.ok(gateInvalid.blockers.some((b) => /invalid/i.test(b)))

const bespoke = read("src/components/bespoke-form.tsx")
assert.match(bespoke, /FormLegalConsent/)
assert.match(bespoke, /consentPrivacyHref|\/privacy/)

const checkout = read("src/components/checkout-form.tsx")
assert.match(checkout, /FormLegalConsent/)
assert.match(checkout, /consentOfferHref/)

console.log("legal-content.fidelity: ok")
