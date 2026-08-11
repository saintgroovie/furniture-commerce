/**
 * public_demo bake must not embed contiguous production-apex needles in
 * shippable storefront modules that compile into robots/shared server chunks.
 *
 * V2: production origins come only from explicit SITE_URL (fail-closed).
 * Join/split "obfuscation" is not isolation - bundlers reconstitute contiguous
 * literals (failed bake 31082069745 / chunk 5052.js).
 *
 *   yarn dlx tsx src/lib/public-demo-production-apex-bundle.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  PRODUCTION_API_HOST,
  PRODUCTION_BUYER_HOSTS,
} from "./production-hosts"
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

// 1. Shippable modules must not contain contiguous production-apex literals
//    AND must not use join/split reconstruction of the production apex.
const shippable = [
  "src/lib/seo-mode.ts",
  "src/lib/launch-contract.ts",
  "src/lib/launch-config.ts",
  "src/lib/indexing-policy.ts",
  "src/lib/production-hosts.ts",
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
  assert.doesNotMatch(
    src,
    /\[\s*["']https:\/\/["']\s*,\s*["']woodright\.ru["']\s*\]/,
    `${rel} must not join-reconstruct production apex`
  )
}

assert.deepEqual(PRODUCTION_BUYER_HOSTS, ["woodright.ru", "www.woodright.ru"])
assert.equal(PRODUCTION_API_HOST, "api.woodright.ru")

// 2. Fail-closed: no SITE_URL → throw (no hardcoded apex fallback).
assert.throws(() => resolvePublicIndexableOrigin(undefined), /requires NEXT_PUBLIC_SITE_URL/)
assert.throws(() => resolvePublicIndexableOrigin(""), /requires NEXT_PUBLIC_SITE_URL/)
assert.throws(
  () => resolvePublicIndexableOrigin("https://" + "woodright-demo.ru"),
  /rejects demo/
)
assert.throws(() => resolvePublicIndexableOrigin("http://127.0.0.1:3200"), /must be https|rejects/)
assert.throws(() => productionSiteOrigin(undefined), /requires NEXT_PUBLIC_SITE_URL/)

// 3. Explicit production SITE_URL resolves via URL.origin (not source literal).
assert.equal(resolvePublicIndexableOrigin(FORBIDDEN_APEX), FORBIDDEN_APEX)
assert.equal(resolvePublicIndexableOrigin(FORBIDDEN_WWW), FORBIDDEN_APEX)
assert.equal(productionSiteOrigin(FORBIDDEN_APEX), FORBIDDEN_APEX)
assert.equal(productionSitemapUrl(FORBIDDEN_APEX), FORBIDDEN_APEX + "/sitemap.xml")

// 4. public_demo / private_noindex robots: no production apex, Disallow, no Sitemap.
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

// 5. Production indexable robots still emit Sitemap from explicit SITE_URL.
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

console.log("public-demo-production-apex-bundle.fidelity: ok")
