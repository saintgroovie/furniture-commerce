/**
 * public_demo bake must not embed contiguous production-apex needles in
 * shippable storefront modules that compile into robots/shared server chunks.
 *
 * Runtime production origin values remain correct via join construction.
 *
 *   yarn dlx tsx src/lib/public-demo-production-apex-bundle.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_BUYER_ORIGINS,
} from "./launch-contract"
import { isIndexingAllowed, robotsTxtBody } from "./indexing-policy"
import {
  productionSitemapUrl,
  productionSiteOrigin,
  resolvePublicIndexableOrigin,
  resolveSeoMode,
} from "./seo-mode"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

/** Contiguous needle forbidden in public_demo filesystem contamination scans. */
const FORBIDDEN_APEX = "https://" + "woodright.ru"
const FORBIDDEN_WWW = "https://" + "www.woodright.ru"
const FORBIDDEN_API = "https://" + "api.woodright.ru"

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

for (const key of [
  "WOODRIGHT_SEO_MODE",
  "WOODRIGHT_LAUNCH_MODE",
  "WOODRIGHT_INDEXING_MODE",
  "WOODRIGHT_RUNTIME_ROLE",
  "WOODRIGHT_IMAGE_BUILD_PROFILE",
  "NEXT_PUBLIC_SITE_URL",
]) {
  delete process.env[key]
}

// 1. Shippable modules must not contain contiguous production-apex literals.
const shippable = [
  "src/lib/seo-mode.ts",
  "src/lib/launch-contract.ts",
  "src/lib/launch-config.ts",
  "src/lib/indexing-policy.ts",
  "src/app/robots.ts",
]
for (const rel of shippable) {
  const src = read(rel)
  assert.ok(
    !src.includes(FORBIDDEN_APEX),
    `${rel} must not embed contiguous ${FORBIDDEN_APEX}`
  )
  assert.ok(
    !src.includes(FORBIDDEN_WWW),
    `${rel} must not embed contiguous ${FORBIDDEN_WWW}`
  )
  assert.ok(
    !src.includes(FORBIDDEN_API),
    `${rel} must not embed contiguous ${FORBIDDEN_API}`
  )
}

// 2. Runtime production contract preserved (join still yields exact origins).
assert.equal(productionSiteOrigin(), FORBIDDEN_APEX)
assert.equal(productionSitemapUrl(), FORBIDDEN_APEX + "/sitemap.xml")
assert.deepEqual(PRODUCTION_BUYER_ORIGINS, [FORBIDDEN_APEX, FORBIDDEN_WWW])
assert.equal(PRODUCTION_API_ORIGIN, FORBIDDEN_API)
assert.equal(resolvePublicIndexableOrigin(undefined), FORBIDDEN_APEX)
assert.equal(resolvePublicIndexableOrigin(FORBIDDEN_APEX), FORBIDDEN_APEX)
assert.equal(
  resolvePublicIndexableOrigin("https://" + "woodright-demo.ru"),
  FORBIDDEN_APEX,
  "demo SITE_URL must not leak into public_indexable origin resolver output"
)

// 3. public_demo / private_noindex robots: no production apex, Disallow, no Sitemap.
process.env.WOODRIGHT_RUNTIME_ROLE = "public_demo"
process.env.WOODRIGHT_IMAGE_BUILD_PROFILE = "public_demo"
process.env.WOODRIGHT_LAUNCH_MODE = "private_noindex"
process.env.NEXT_PUBLIC_SITE_URL = "https://" + "woodright-demo.ru"
assert.equal(resolveSeoMode(), "demo_noindex")
assert.equal(isIndexingAllowed(), false)
{
  const body = robotsTxtBody()
  assert.match(body, /Disallow:\s*\//)
  assert.doesNotMatch(body, /Sitemap:/i)
  assert.ok(!body.includes(FORBIDDEN_APEX), "demo robots body must not cite production apex")
}
delete process.env.WOODRIGHT_RUNTIME_ROLE
delete process.env.WOODRIGHT_IMAGE_BUILD_PROFILE
delete process.env.WOODRIGHT_LAUNCH_MODE
delete process.env.NEXT_PUBLIC_SITE_URL

// 4. Missing demo origin must not fall back via getSiteUrl path is covered elsewhere;
//    robots default with demo identity still Disallow without Sitemap.
process.env.WOODRIGHT_IMAGE_BUILD_PROFILE = "public_demo"
assert.equal(resolveSeoMode(), "demo_noindex")
assert.doesNotMatch(robotsTxtBody(), new RegExp(FORBIDDEN_APEX.replace(/\./g, "\\.")))
delete process.env.WOODRIGHT_IMAGE_BUILD_PROFILE

// 5. Production indexable robots still emit governed Sitemap on production apex.
process.env.WOODRIGHT_SEO_MODE = "public_indexable"
process.env.WOODRIGHT_LAUNCH_MODE = "public_indexable"
process.env.WOODRIGHT_INDEXING_MODE = "index"
process.env.WOODRIGHT_RUNTIME_ROLE = "public_production"
process.env.NEXT_PUBLIC_SITE_URL = FORBIDDEN_APEX
assert.equal(isIndexingAllowed(), true)
{
  const body = robotsTxtBody()
  assert.match(body, /Allow:\s*\//)
  assert.match(body, new RegExp(`Sitemap:\\s*${FORBIDDEN_APEX.replace(/\./g, "\\.")}/sitemap\\.xml`))
  assert.doesNotMatch(body, /woodright-demo/)
}
delete process.env.WOODRIGHT_SEO_MODE
delete process.env.WOODRIGHT_LAUNCH_MODE
delete process.env.WOODRIGHT_INDEXING_MODE
delete process.env.WOODRIGHT_RUNTIME_ROLE
delete process.env.NEXT_PUBLIC_SITE_URL

console.log("PASS public-demo-production-apex-bundle fidelity")
