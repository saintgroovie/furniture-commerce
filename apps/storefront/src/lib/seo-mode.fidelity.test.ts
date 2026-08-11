/**
 * Guard: SEO mode + sitemap helpers + robots Sitemap line.
 *
 *   yarn dlx tsx src/lib/seo-mode.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  productionSitemapUrl,
  productionSiteOrigin,
  resolvePublicIndexableOrigin,
  resolveSeoMode,
  seoModeToIndexingRaw,
} from "./seo-mode"
import {
  collectProductSitemapEntries,
  collectStaticSitemapEntries,
  escapeXml,
  isBlockedSitemapPath,
  isProductionSitemapLoc,
  mergeSitemapEntries,
  renderSitemapXml,
} from "./sitemap-entries"
import { isIndexingAllowed, robotsTxtBody } from "./indexing-policy"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// Isolate from shell pollution (e.g. wr_load_environment_profile in the same session).
for (const key of [
  "WOODRIGHT_SEO_MODE",
  "WOODRIGHT_LAUNCH_MODE",
  "WOODRIGHT_INDEXING_MODE",
  "WOODRIGHT_RUNTIME_ROLE",
  "WOODRIGHT_IMAGE_BUILD_PROFILE",
]) {
  delete process.env[key]
}

assert.equal(resolveSeoMode({}), "private_noindex")
assert.equal(
  resolveSeoMode({ runtimeRole: "public_demo", imageBuildProfile: "public_demo" }),
  "demo_noindex"
)
assert.equal(
  resolveSeoMode({
    runtimeRole: "public_demo",
    seoMode: "public_indexable",
    launchMode: "public_indexable",
  }),
  "demo_noindex",
  "demo identity must never become indexable"
)
assert.equal(
  resolveSeoMode({ launchMode: "private_noindex" }),
  "private_noindex"
)
assert.equal(
  resolveSeoMode({ launchMode: "public_indexable" }),
  "private_noindex",
  "launch mode alone must not unlock indexing"
)
assert.equal(
  resolveSeoMode({ seoMode: "public_indexable" }),
  "private_noindex",
  "SEO mode alone must not unlock indexing"
)
assert.equal(
  resolveSeoMode({
    seoMode: "public_indexable",
    runtimeRole: "public_production",
  }),
  "public_indexable"
)
assert.equal(
  resolveSeoMode({
    launchMode: "public_indexable",
    imageBuildProfile: "public_production",
  }),
  "public_indexable"
)
assert.equal(
  resolveSeoMode({
    seoMode: "public_indexable",
    runtimeRole: "production",
    imageBuildProfile: "public_production",
  }),
  "private_noindex",
  "conflicting role vs profile must fail closed"
)
assert.equal(
  resolveSeoMode({
    seoMode: "public_indexable",
    runtimeRole: "production_candidate",
    imageBuildProfile: "public_production",
  }),
  "private_noindex",
  "candidate role + public_production profile must fail closed"
)
assert.equal(
  resolveSeoMode({
    seoMode: "public_indexable",
    runtimeRole: "public_production",
    imageBuildProfile: "production_candidate",
  }),
  "private_noindex",
  "public_production role + candidate profile must fail closed"
)
assert.equal(
  resolveSeoMode({
    indexingMode: "index",
    runtimeRole: "public_production",
  }),
  "public_indexable"
)
assert.equal(
  resolveSeoMode({ indexingMode: "index" }),
  "private_noindex",
  "legacy INDEXING_MODE=index alone must not unlock indexing"
)
assert.equal(
  resolveSeoMode({ runtimeRole: "public_production" }),
  "private_noindex",
  "role alone must not unlock indexing"
)
assert.equal(
  resolveSeoMode({
    runtimeRole: "production",
    seoMode: "public_indexable",
  }),
  "private_noindex",
  "production candidate must not unlock indexing"
)

// Conflicting / unknown populated controls must fail closed (Codex P1).
const conflictCases: Array<{
  name: string
  env: Parameters<typeof resolveSeoMode>[0]
  expected: ReturnType<typeof resolveSeoMode>
}> = [
  {
    name: "SEO private + launch indexable + public_production",
    env: {
      seoMode: "private_noindex",
      launchMode: "public_indexable",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "SEO demo_noindex + INDEXING=index + public_production",
    env: {
      seoMode: "demo_noindex",
      indexingMode: "index",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "SEO indexable + launch private + public_production",
    env: {
      seoMode: "public_indexable",
      launchMode: "private_noindex",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "launch indexable + INDEXING=noindex + public_production",
    env: {
      launchMode: "public_indexable",
      indexingMode: "noindex",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "unknown SEO mode + launch indexable + public_production",
    env: {
      seoMode: "bogus",
      launchMode: "public_indexable",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "unknown launch mode + SEO indexable + public_production",
    env: {
      seoMode: "public_indexable",
      launchMode: "not_a_mode",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "unknown INDEXING_MODE + SEO indexable + public_production",
    env: {
      seoMode: "public_indexable",
      indexingMode: "indexable",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
  {
    name: "all three agree indexable + public_production",
    env: {
      seoMode: "public_indexable",
      launchMode: "public_indexable",
      indexingMode: "index",
      runtimeRole: "public_production",
    },
    expected: "public_indexable",
  },
  {
    name: "all three agree noindex + public_production",
    env: {
      seoMode: "private_noindex",
      launchMode: "private_noindex",
      indexingMode: "noindex",
      runtimeRole: "public_production",
    },
    expected: "private_noindex",
  },
]
for (const c of conflictCases) {
  assert.equal(resolveSeoMode(c.env), c.expected, c.name)
}

assert.equal(seoModeToIndexingRaw("public_indexable"), "index")
assert.equal(seoModeToIndexingRaw("demo_noindex"), "noindex")

assert.equal(resolvePublicIndexableOrigin("https://www.woodright.ru"), "https://woodright.ru")
assert.equal(resolvePublicIndexableOrigin("https://woodright.ru"), "https://woodright.ru")
assert.throws(
  () => resolvePublicIndexableOrigin("https://woodright-demo.ru"),
  /rejects demo/
)
assert.throws(() => resolvePublicIndexableOrigin("http://127.0.0.1:3200"), /must be https|rejects/)
delete process.env.NEXT_PUBLIC_SITE_URL
assert.throws(() => resolvePublicIndexableOrigin(undefined), /requires NEXT_PUBLIC_SITE_URL/)
assert.throws(() => resolvePublicIndexableOrigin(""), /requires NEXT_PUBLIC_SITE_URL/)
assert.throws(() => resolvePublicIndexableOrigin(null), /requires NEXT_PUBLIC_SITE_URL/)
process.env.NEXT_PUBLIC_SITE_URL = "https://woodright.ru"
assert.equal(productionSitemapUrl(), "https://woodright.ru/sitemap.xml")
assert.equal(productionSiteOrigin(), "https://woodright.ru")

const bodyIndex = robotsTxtBody("index")
assert.match(bodyIndex, /Allow:\s*\//)
assert.match(bodyIndex, /Sitemap:\s*https:\/\/woodright\.ru\/sitemap\.xml/)
assert.doesNotMatch(bodyIndex, /woodright-demo/)
assert.doesNotMatch(bodyIndex, /Disallow:\s*\//)
delete process.env.NEXT_PUBLIC_SITE_URL

assert.equal(isBlockedSitemapPath("/cart"), true)
assert.equal(isBlockedSitemapPath("/checkout"), true)
assert.equal(isBlockedSitemapPath("/product/x"), false)

const staticEntries = collectStaticSitemapEntries("https://woodright.ru")
assert.ok(staticEntries.some((e) => e.loc === "https://woodright.ru/"))
assert.ok(staticEntries.every((e) => e.loc.startsWith("https://woodright.ru")))
assert.ok(!staticEntries.some((e) => e.loc.includes("/cart")))

const products = collectProductSitemapEntries("https://woodright.ru", [
  { handle: "greenwich-gr-67-1" },
  { handle: "greenwich-gr-67-1" },
  { handle: "" },
  { handle: "../evil" },
  { handle: "ok-handle-2" },
])
assert.equal(products.length, 2)
assert.deepEqual(
  products.map((p) => p.loc).sort(),
  [
    "https://woodright.ru/product/greenwich-gr-67-1",
    "https://woodright.ru/product/ok-handle-2",
  ]
)

const merged = mergeSitemapEntries([
  ...staticEntries,
  ...products,
  { loc: "https://woodright-demo.ru/product/x" },
  { loc: "http://127.0.0.1/product/x" },
  { loc: "https://woodright.ru.evil.example/product/x" },
  { loc: "https://evil.woodright.ru/product/x" },
])
assert.ok(merged.every((e) => isProductionSitemapLoc(e.loc)))
assert.ok(
  !merged.some((e) => e.loc.includes("evil") || e.loc.includes("woodright-demo")),
  "merge must reject host-prefix spoofs and demo hosts"
)
assert.equal(isProductionSitemapLoc("https://woodright.ru/product/x"), true)
assert.equal(isProductionSitemapLoc("https://woodright.ru.evil.example/x"), false)
assert.equal(isProductionSitemapLoc("https://www.woodright.ru/"), false)
assert.equal(escapeXml(`a&b<"'>`), "a&amp;b&lt;&quot;&apos;&gt;")

const xml = renderSitemapXml(merged.slice(0, 3))
assert.match(xml, /<\?xml version="1.0"/)
assert.match(xml, /urlset/)
assert.match(xml, /<loc>/)

const robotsRoute = read("src/app/robots.ts")
assert.match(robotsRoute, /sitemap/)
assert.match(robotsRoute, /resolvePublicIndexableOrigin/)
assert.match(robotsRoute, /isIndexingAllowed/)

const sitemapRoute = read("src/app/sitemap.xml/route.ts")
assert.match(sitemapRoute, /status:\s*200/)
assert.match(sitemapRoute, /status:\s*404/)
assert.match(sitemapRoute, /status:\s*503/)
assert.match(sitemapRoute, /Array\.isArray\(catalog\.products\)/)
assert.match(sitemapRoute, /renderSitemapXml/)
assert.match(sitemapRoute, /isIndexingAllowed/)

// Default-path + conflict matrices through the same helpers routes call (Codex P2).
assert.equal(isIndexingAllowed(), false, "default env must not index")
{
  const defaultBody = robotsTxtBody()
  assert.match(defaultBody, /Disallow:\s*\//)
  assert.doesNotMatch(defaultBody, /Sitemap:/i)
}

process.env.WOODRIGHT_SEO_MODE = "private_noindex"
process.env.WOODRIGHT_LAUNCH_MODE = "public_indexable"
process.env.WOODRIGHT_RUNTIME_ROLE = "public_production"
assert.equal(
  isIndexingAllowed(),
  false,
  "conflicting controls must not index via default path"
)
assert.doesNotMatch(robotsTxtBody(), /Sitemap:/i)
delete process.env.WOODRIGHT_SEO_MODE
delete process.env.WOODRIGHT_LAUNCH_MODE
delete process.env.WOODRIGHT_RUNTIME_ROLE

process.env.WOODRIGHT_SEO_MODE = "public_indexable"
process.env.WOODRIGHT_LAUNCH_MODE = "public_indexable"
process.env.WOODRIGHT_INDEXING_MODE = "index"
process.env.WOODRIGHT_RUNTIME_ROLE = "public_production"
process.env.NEXT_PUBLIC_SITE_URL = "https://woodright.ru"
assert.equal(isIndexingAllowed(), true, "unanimous indexable must allow")
{
  const indexBody = robotsTxtBody()
  assert.match(indexBody, /Allow:\s*\//)
  assert.match(indexBody, /Sitemap:\s*https:\/\/woodright\.ru\/sitemap\.xml/)
}
delete process.env.WOODRIGHT_SEO_MODE
delete process.env.WOODRIGHT_LAUNCH_MODE
delete process.env.WOODRIGHT_INDEXING_MODE
delete process.env.WOODRIGHT_RUNTIME_ROLE
delete process.env.NEXT_PUBLIC_SITE_URL
const pdp = read("src/app/product/[id]/page.tsx")
assert.match(pdp, /notFound\(/)
assert.doesNotMatch(pdp, /title:\s*"Товар"/)
assert.match(pdp, /indexingCanonical/)
assert.match(pdp, /throw e/, "metadata must rethrow non-NOT_FOUND errors")

const profile = read(
  "../../ops/config/runtime-environments/public_production.conf"
)
assert.match(profile, /WOODRIGHT_ENVIRONMENT=public_production/)
assert.match(profile, /WOODRIGHT_SEO_MODE=public_indexable/)
assert.match(profile, /WOODRIGHT_LAUNCH_MODE=public_indexable/)
assert.match(profile, /WOODRIGHT_OWNERSHIP_DIR=\/srv\/woodright\/runtime-ownership-public-production/)
assert.match(profile, /WOODRIGHT_MUTATION_LOCK_PATH=\/srv\/woodright\/locks\/public_production\//)
assert.doesNotMatch(profile, /runtime-ownership-public-demo/)
assert.doesNotMatch(profile, /runtime-ownership-production[^-]/)

// Shippable SEO modules must not embed contiguous production-apex needles
// (public_demo contamination scan / failed run 31082069745). Join is not isolation.
{
  const FORBIDDEN_APEX = "https://" + "woodright.ru"
  for (const rel of [
    "src/lib/seo-mode.ts",
    "src/app/robots.ts",
    "src/lib/indexing-policy.ts",
    "src/lib/production-hosts.ts",
  ]) {
    const src = read(rel)
    assert.ok(
      !src.includes(FORBIDDEN_APEX),
      `${rel} must not embed contiguous production apex`
    )
    assert.doesNotMatch(
      src,
      /\[\s*["']https:\/\/["']\s*,\s*["']woodright\.ru["']\s*\]/,
      `${rel} must not join-reconstruct production apex`
    )
  }
  process.env.NEXT_PUBLIC_SITE_URL = FORBIDDEN_APEX
  assert.equal(productionSiteOrigin(), FORBIDDEN_APEX)
  delete process.env.NEXT_PUBLIC_SITE_URL
  assert.throws(() => productionSiteOrigin(undefined), /requires NEXT_PUBLIC_SITE_URL/)
}

console.log("seo-mode.fidelity: ok")
