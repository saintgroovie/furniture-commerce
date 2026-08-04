/**
 * Guard: Woodright public-launch contract (fail-closed launch mode / URLs).
 *
 *   yarn dlx tsx src/lib/launch-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEMO_HOSTS,
  LOOPBACK_HOST_RE,
  PRODUCTION_API_ORIGIN,
  PRODUCTION_BUYER_ORIGINS,
  PUBLIC_DEMO_BUYER_ORIGINS,
  assertProductionLikeApiUrl,
  assertProductionLikeSiteUrl,
  assertPublicDemoSiteUrl,
  isProductionLikeRuntime,
  isPublicDemoRuntime,
  launchModeToIndexingMode,
  parseLaunchModeLenient,
  resolveLaunchMode,
  validateLaunchContract,
} from "./launch-contract"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// --- constants ---
assert.deepEqual(PRODUCTION_BUYER_ORIGINS, ["https://woodright.ru", "https://www.woodright.ru"])
assert.equal(PRODUCTION_API_ORIGIN, "https://api.woodright.ru")
assert.ok(DEMO_HOSTS.includes("woodright-demo.ru"))
assert.ok(DEMO_HOSTS.includes("www.woodright-demo.ru"))
assert.ok(DEMO_HOSTS.includes("api.woodright-demo.ru"))
assert.ok(LOOPBACK_HOST_RE.test("localhost"))
assert.ok(LOOPBACK_HOST_RE.test("127.0.0.1"))
assert.ok(LOOPBACK_HOST_RE.test("localhost:8000"))
assert.ok(!LOOPBACK_HOST_RE.test("woodright.ru"))

// --- isProductionLikeRuntime ---
assert.equal(isProductionLikeRuntime("production"), true)
assert.equal(isProductionLikeRuntime("production_candidate"), true)
assert.equal(isProductionLikeRuntime("non_public_candidate"), false)
assert.equal(isProductionLikeRuntime("public_demo"), false)
assert.equal(isProductionLikeRuntime(undefined), false)
assert.equal(isProductionLikeRuntime(""), false)

// --- launchModeToIndexingMode / parseLaunchModeLenient ---
assert.equal(launchModeToIndexingMode("private_noindex"), "noindex")
assert.equal(launchModeToIndexingMode("public_indexable"), "index")
assert.equal(parseLaunchModeLenient(undefined), undefined)
assert.equal(parseLaunchModeLenient(""), undefined)
assert.equal(parseLaunchModeLenient("bogus"), undefined)
assert.equal(parseLaunchModeLenient("PRIVATE_NOINDEX"), "private_noindex")
assert.equal(parseLaunchModeLenient("public_indexable"), "public_indexable")

// --- resolveLaunchMode: explicit values always win ---
assert.equal(resolveLaunchMode("private_noindex"), "private_noindex")
assert.equal(resolveLaunchMode("public_indexable"), "public_indexable")
assert.equal(resolveLaunchMode("PUBLIC_INDEXABLE"), "public_indexable")
assert.throws(() => resolveLaunchMode("bogus"), /Unknown WOODRIGHT_LAUNCH_MODE/)

// --- resolveLaunchMode: fail-closed only for production-like role + production NODE_ENV ---
assert.equal(
  resolveLaunchMode(undefined, { nodeEnv: "development", runtimeRole: undefined }),
  "private_noindex"
)
assert.equal(
  resolveLaunchMode(undefined, { nodeEnv: "production", runtimeRole: undefined }),
  "private_noindex",
  "production NODE_ENV with no runtime role (e.g. plain `yarn build`) must not require the var"
)
assert.equal(
  resolveLaunchMode(undefined, { nodeEnv: "development", runtimeRole: "production_candidate" }),
  "private_noindex",
  "non-production NODE_ENV must not require the var even if role is production-like"
)
assert.throws(
  () => resolveLaunchMode(undefined, { nodeEnv: "production", runtimeRole: "production_candidate" }),
  /WOODRIGHT_LAUNCH_MODE is required/
)
assert.throws(
  () => resolveLaunchMode(undefined, { nodeEnv: "production", runtimeRole: "production" }),
  /WOODRIGHT_LAUNCH_MODE is required/
)
assert.equal(
  resolveLaunchMode(undefined, { nodeEnv: "production", runtimeRole: "non_public_candidate" }),
  "private_noindex"
)

// --- assertProductionLikeSiteUrl ---
assert.equal(assertProductionLikeSiteUrl("https://woodright.ru"), "https://woodright.ru")
assert.equal(assertProductionLikeSiteUrl("https://woodright.ru/"), "https://woodright.ru")
assert.throws(() => assertProductionLikeSiteUrl(undefined), /required/)
assert.throws(() => assertProductionLikeSiteUrl(""), /required/)
assert.throws(() => assertProductionLikeSiteUrl("http://woodright.ru"), /must be https/)
assert.throws(() => assertProductionLikeSiteUrl("https://woodright-demo.ru"), /demo host/)
assert.throws(() => assertProductionLikeSiteUrl("https://localhost:8000"), /loopback/)
assert.throws(() => assertProductionLikeSiteUrl("https://127.0.0.1:8000"), /loopback/)
assert.throws(() => assertProductionLikeSiteUrl("not a url"), /valid absolute URL/)

// --- assertPublicDemoSiteUrl / isPublicDemoRuntime ---
assert.deepEqual(PUBLIC_DEMO_BUYER_ORIGINS, [
  "https://woodright-demo.ru",
  "https://www.woodright-demo.ru",
])
assert.equal(isPublicDemoRuntime("public_demo"), true)
assert.equal(isPublicDemoRuntime(undefined, "public_demo"), true)
assert.equal(isPublicDemoRuntime("production"), false)
assert.equal(assertPublicDemoSiteUrl("https://woodright-demo.ru"), "https://woodright-demo.ru")
assert.throws(() => assertPublicDemoSiteUrl("https://woodright.ru"), /production host/)
assert.throws(() => assertPublicDemoSiteUrl("https://evil.example"), /woodright-demo\.ru/)

// --- assertProductionLikeApiUrl ---
assert.equal(assertProductionLikeApiUrl("https://api.woodright.ru"), "https://api.woodright.ru")
assert.throws(() => assertProductionLikeApiUrl(undefined), /required/)
assert.throws(() => assertProductionLikeApiUrl("http://api.woodright.ru"), /must be https/)
assert.throws(() => assertProductionLikeApiUrl("https://api.woodright-demo.ru"), /demo host/)
assert.throws(() => assertProductionLikeApiUrl("https://127.0.0.1:9000"), /loopback/)
// Recommended, not enforced: a different https host is accepted.
assert.equal(
  assertProductionLikeApiUrl("https://api2.woodright.ru"),
  "https://api2.woodright.ru"
)

// --- validateLaunchContract ---
{
  const result = validateLaunchContract({
    launchMode: "private_noindex",
    siteUrl: "https://woodright.ru",
    apiUrl: "https://api.woodright.ru",
    adminExposure: "private",
    paymentMode: "manual_invoice",
    legalContentStatus: "draft",
  })
  assert.equal(result.ok, true, result.errors.join("; "))
  assert.deepEqual(result.errors, [])
}

{
  // public_indexable requires approved legal + a public-ready payment mode -
  // neither exists yet, so this must fail-closed with both errors.
  const result = validateLaunchContract({
    launchMode: "public_indexable",
    siteUrl: "https://woodright.ru",
    apiUrl: "https://api.woodright.ru",
    adminExposure: "private",
    paymentMode: "manual_invoice",
    legalContentStatus: "draft",
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /legalContentStatus/.test(e)))
  assert.ok(result.errors.some((e) => /paymentMode/.test(e)))
}

{
  const result = validateLaunchContract({
    launchMode: "private_noindex",
    siteUrl: "https://woodright-demo.ru",
    apiUrl: "http://api.woodright.ru",
    adminExposure: "public",
    paymentMode: "manual_invoice",
    legalContentStatus: "missing_owner_input",
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => /siteUrl/.test(e)))
  assert.ok(result.errors.some((e) => /apiUrl/.test(e)))
  assert.ok(result.errors.some((e) => /adminExposure/.test(e)))
  assert.ok(result.warnings.some((w) => /legalContentStatus/.test(w)))
}

// --- Static wiring: getSiteUrl must consume this contract, no localhost fallback in production-like paths ---
const base = read("src/lib/api/base.ts")
assert.match(base, /assertProductionLikeSiteUrl/, "base.ts must validate production-like site URL")
assert.match(base, /assertPublicDemoSiteUrl/, "base.ts must validate public-demo site URL")
assert.match(base, /isProductionLikeRuntime/, "base.ts must check production-like runtime role")
assert.match(base, /isPublicDemoRuntime/, "base.ts must check public_demo identity")

// --- Static wiring: indexing-policy derives via resolveSeoMode (launch alone is not enough) ---
const indexingPolicy = read("src/lib/indexing-policy.ts")
assert.match(indexingPolicy, /WOODRIGHT_LAUNCH_MODE/, "indexing-policy.ts must read WOODRIGHT_LAUNCH_MODE")
assert.match(indexingPolicy, /resolveSeoMode/, "indexing-policy.ts must resolve via seo-mode")
assert.match(indexingPolicy, /seoModeToIndexingRaw/, "indexing-policy.ts must map SEO mode to indexing raw")
assert.match(indexingPolicy, /export function launchCanonical/, "indexing-policy.ts must export launchCanonical")

const seoMode = read("src/lib/seo-mode.ts")
assert.match(seoMode, /WOODRIGHT_LAUNCH_MODE/, "seo-mode.ts must read WOODRIGHT_LAUNCH_MODE")
assert.match(seoMode, /isPublicProductionRuntime/, "seo-mode.ts must gate indexable on public_production")
assert.match(seoMode, /parseLaunchModeLenient/, "seo-mode.ts must parse launch mode")

console.log("launch-contract.fidelity: ok")
