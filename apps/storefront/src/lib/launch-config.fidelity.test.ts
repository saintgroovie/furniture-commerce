/**
 * Launch config + CORS/CSP/legal readiness fidelity.
 *   yarn exec tsx src/lib/launch-config.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  normalizeOrigin,
  resolveLaunchIndexingMode,
  resolvePaymentLaunchMode,
  validatePublicLaunchProfile,
} from "./launch-config"
import {
  assertSafePublicConnectOrigin,
  buildConnectSrcDirective,
  cspConnectSrcExtras,
} from "./csp-policy"
import {
  isLegalLaunchComplete,
  missingRequiredLegalFields,
  LEGAL_OWNER_FIELD_META,
} from "./legal/owner-inputs"
import { LEGAL_PAGE_IDS, buildLegalPage } from "./legal/legal-content"
import { resolveIndexingMode } from "./indexing-policy"

/** Test-only prepared profile (not imported by shippable modules). */
const PREPARED_PRODUCTION_PRIVATE_NOINDEX = {
  siteOrigin: "https://" + "woodright.ru",
  apiOrigin: "https://" + "api.woodright.ru",
  indexingMode: "private_noindex" as const,
  adminExposure: "private" as const,
  paymentMode: "manager_payment_link" as const,
  storeCorsOrigins: [
    "https://" + "woodright.ru",
    "https://" + "www.woodright.ru",
  ],
  runtimeRole: "production",
  exposure: "public",
  databaseIdentity: "production_db",
} as const

assert.equal(normalizeOrigin("https://woodright.ru/"), "https://woodright.ru")
assert.equal(normalizeOrigin("https://evilwoodright.ru"), "https://evilwoodright.ru")
assert.equal(resolveLaunchIndexingMode("private_noindex"), "private_noindex")
assert.equal(resolveLaunchIndexingMode("public_indexable"), "public_indexable")
// Runtime robots policy must not treat the template alias as live index.
assert.equal(resolveIndexingMode("public_indexable"), "noindex")
assert.equal(resolveIndexingMode("private_noindex"), "noindex")
assert.equal(resolveIndexingMode("index"), "index")
assert.equal(resolvePaymentLaunchMode(""), "manager_payment_link")
assert.equal(resolvePaymentLaunchMode("bogus"), "invalid")

const profileIssues = validatePublicLaunchProfile({
  ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
  legalComplete: false,
  adminUserCount: 0,
})
assert.ok(profileIssues.some((i) => i.code === "legal_inputs_incomplete"))
assert.ok(profileIssues.some((i) => i.code === "admin_user_required"))

assert.ok(
  validatePublicLaunchProfile({
    ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
    indexingMode: "public_indexable",
    legalComplete: true,
    adminUserCount: 1,
  }).some((i) => i.code === "indexable_requires_separate_approval")
)
assert.ok(
  validatePublicLaunchProfile({
    ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
    paymentMode: "invalid",
    legalComplete: true,
    adminUserCount: 1,
  }).some((i) => i.code === "payment_mode_invalid")
)
assert.ok(
  validatePublicLaunchProfile({
    ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
    adminExposure: "public",
    legalComplete: true,
    adminUserCount: 1,
  }).some((i) => i.code === "admin_exposure_not_private")
)
assert.ok(
  validatePublicLaunchProfile({
    ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
  }).some((i) => i.code === "legal_complete_unspecified")
)

const passIssues = validatePublicLaunchProfile({
  ...PREPARED_PRODUCTION_PRIVATE_NOINDEX,
  legalComplete: true,
  adminUserCount: 1,
})
assert.equal(passIssues.length, 0)

assert.equal(assertSafePublicConnectOrigin("https://api.woodright.ru"), true)
assert.equal(assertSafePublicConnectOrigin("http://api.woodright.ru"), false)
assert.equal(assertSafePublicConnectOrigin("https://api.woodright-demo.ru"), false)
assert.equal(assertSafePublicConnectOrigin("https://localhost:9000"), false)

const publicConnect = cspConnectSrcExtras(
  {
    WOODRIGHT_EXPOSURE: "public",
    WOODRIGHT_RUNTIME_ROLE: "production",
    WOODRIGHT_CANONICAL_API_ORIGIN: "https://api.woodright.ru",
  },
  "public"
)
assert.deepEqual(publicConnect, ["https://api.woodright.ru"])
assert.deepEqual(
  cspConnectSrcExtras(
    {
      WOODRIGHT_EXPOSURE: "public",
      WOODRIGHT_RUNTIME_ROLE: "production",
      WOODRIGHT_CANONICAL_API_ORIGIN: "https://evil.example",
    },
    "public"
  ),
  []
)
assert.match(
  buildConnectSrcDirective(
    {
      WOODRIGHT_EXPOSURE: "public",
      WOODRIGHT_RUNTIME_ROLE: "production",
      WOODRIGHT_CANONICAL_API_ORIGIN: "https://api.woodright.ru",
    },
    "public"
  ),
  /connect-src 'self' https:\/\/api\.woodright\.ru/
)

assert.equal(isLegalLaunchComplete({}), false)
assert.ok(missingRequiredLegalFields({}).length >= 10)
assert.ok(LEGAL_OWNER_FIELD_META.every((f) => f.labelRu && f.whyRequired))

for (const id of LEGAL_PAGE_IDS) {
  const page = buildLegalPage(id, {})
  assert.equal(page.id, id)
  assert.ok(page.title)
  assert.ok(page.path.startsWith("/"))
  assert.equal(page.incompleteForPublicLaunch, true)
  const blob = JSON.stringify(page)
  assert.doesNotMatch(blob, /\bTODO\b|PLACEHOLDER/i)
}

for (const id of ["privacy", "offer", "delivery", "returns", "warranty"] as const) {
  const blob = JSON.stringify(buildLegalPage(id, {}))
  assert.match(blob, /Шоурум|Химки|Гранд/)
}

const payment = buildLegalPage("payment", {})
assert.match(JSON.stringify(payment), /PaymentLink|Ожидает оплаты/)

console.log("launch-config.fidelity: ok")
