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
  resolvePublicIndexableOrigin,
  resolveSeoMode,
  seoModeToIndexingRaw,
} from "./seo-mode"
import {
  collectProductSitemapEntries,
  collectStaticSitemapEntries,
  escapeXml,
  isBlockedSitemapPath,
  mergeSitemapEntries,
  renderSitemapXml,
} from "./sitemap-entries"
import { robotsTxtBody } from "./indexing-policy"

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
assert.equal(seoModeToIndexingRaw("public_indexable"), "index")
assert.equal(seoModeToIndexingRaw("demo_noindex"), "noindex")

assert.equal(resolvePublicIndexableOrigin("https://www.woodright.ru"), "https://woodright.ru")
assert.equal(resolvePublicIndexableOrigin("https://woodright.ru"), "https://woodright.ru")
assert.equal(resolvePublicIndexableOrigin("https://woodright-demo.ru"), "https://woodright.ru")
assert.equal(resolvePublicIndexableOrigin("http://127.0.0.1:3200"), "https://woodright.ru")
assert.equal(productionSitemapUrl(), "https://woodright.ru/sitemap.xml")

const bodyIndex = robotsTxtBody("index")
assert.match(bodyIndex, /Allow:\s*\//)
assert.match(bodyIndex, /Sitemap:\s*https:\/\/woodright\.ru\/sitemap\.xml/)
assert.doesNotMatch(bodyIndex, /woodright-demo/)
assert.doesNotMatch(bodyIndex, /Disallow:\s*\//)

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
])
assert.ok(merged.every((e) => e.loc.startsWith("https://woodright.ru")))
assert.equal(escapeXml(`a&b<"'>`), "a&amp;b&lt;&quot;&apos;&gt;")

const xml = renderSitemapXml(merged.slice(0, 3))
assert.match(xml, /<\?xml version="1.0"/)
assert.match(xml, /urlset/)
assert.match(xml, /<loc>/)

const robotsRoute = read("src/app/robots.ts")
assert.match(robotsRoute, /sitemap/)
assert.match(robotsRoute, /productionSitemapUrl|resolvePublicIndexableOrigin/)

const sitemapRoute = read("src/app/sitemap.xml/route.ts")
assert.match(sitemapRoute, /status:\s*200/)
assert.match(sitemapRoute, /status:\s*503/)
assert.match(sitemapRoute, /Array\.isArray\(catalog\.products\)/)
assert.match(sitemapRoute, /renderSitemapXml/)
assert.match(sitemapRoute, /isIndexingAllowed/)

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

console.log("seo-mode.fidelity: ok")
