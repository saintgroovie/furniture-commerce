/**
 * Guard: demo/staging SEO indexing policy (fail-closed noindex).
 *
 *   yarn exec tsx src/lib/indexing-policy.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  indexingCanonical,
  indexingRobotsMetadata,
  isIndexingAllowed,
  resolveIndexingMode,
  robotsTxtBody,
  shouldEmitXRobotsTag,
  X_ROBOTS_TAG_NOINDEX,
} from "./indexing-policy"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// 1–2 fail-closed defaults
assert.equal(resolveIndexingMode(undefined), "noindex")
assert.equal(resolveIndexingMode(""), "noindex")
assert.equal(resolveIndexingMode("   "), "noindex")
assert.equal(resolveIndexingMode("NOINDEX"), "noindex")
assert.equal(resolveIndexingMode("bogus"), "noindex")
assert.equal(resolveIndexingMode("indexable"), "noindex")
assert.equal(isIndexingAllowed(undefined), false)
assert.equal(isIndexingAllowed(""), false)

// 19 explicit index only
assert.equal(resolveIndexingMode("index"), "index")
assert.equal(resolveIndexingMode("INDEX"), "index")
assert.equal(isIndexingAllowed("index"), true)

const robotsNo = indexingRobotsMetadata(undefined)
assert.equal(robotsNo.index, false)
assert.equal(robotsNo.follow, false)
assert.equal(robotsNo.noarchive, true)

const robotsYes = indexingRobotsMetadata("index")
assert.equal(robotsYes.index, true)
assert.equal(robotsYes.follow, true)
assert.equal(robotsYes.noarchive, undefined)

assert.equal(indexingCanonical("https://woodright-demo.ru/catalog"), undefined)
assert.deepEqual(indexingCanonical("https://woodright-demo.ru/catalog", "index"), {
  canonical: "https://woodright-demo.ru/catalog",
})

const body = robotsTxtBody()
assert.match(body, /User-agent:\s*\*/)
assert.match(body, /Disallow:\s*\//)
assert.doesNotMatch(body, /Sitemap:/i)
assert.doesNotMatch(body, /Allow:\s*\//)

const bodyIndex = robotsTxtBody("index")
assert.match(bodyIndex, /Allow:\s*\//)
assert.doesNotMatch(bodyIndex, /Disallow:\s*\//)

assert.equal(X_ROBOTS_TAG_NOINDEX, "noindex, nofollow, noarchive")
assert.equal(shouldEmitXRobotsTag(undefined, "production"), true)
assert.equal(shouldEmitXRobotsTag("noindex", "production"), true)
assert.equal(shouldEmitXRobotsTag("index", "production"), false)
assert.equal(shouldEmitXRobotsTag(undefined, "development"), false)
assert.equal(shouldEmitXRobotsTag("noindex", "development"), true)

// Static wiring
const layout = read("src/app/layout.tsx")
assert.match(layout, /indexingRobotsMetadata/)
assert.match(layout, /robots:\s*indexingRobotsMetadata/)

const middleware = read("src/middleware.ts")
assert.match(middleware, /X-Robots-Tag/)
assert.match(middleware, /shouldEmitXRobotsTag/)
assert.match(middleware, /X_ROBOTS_TAG_NOINDEX/)

const robotsRoute = read("src/app/robots.ts")
assert.match(robotsRoute, /disallow:\s*"\/"/)
assert.doesNotMatch(robotsRoute, /sitemap:/i)

const sitemapRoute = read("src/app/sitemap.xml/route.ts")
assert.match(sitemapRoute, /status:\s*404/)
assert.match(sitemapRoute, /isIndexingAllowed/)

for (const rel of [
  "src/app/product/[id]/page.tsx",
  "src/app/rooms/[slug]/page.tsx",
  "src/app/kids/willie-winkie/page.tsx",
  "src/app/kids/willie-winkie/[motifSlug]/page.tsx",
]) {
  const src = read(rel)
  assert.match(src, /indexingCanonical/, `${rel} must gate canonical`)
  assert.doesNotMatch(
    src,
    /alternates:\s*\{\s*canonical:/,
    `${rel} must not hardcode canonical outside indexingCanonical`
  )
  assert.doesNotMatch(src, /woodright\.ru(?!-demo)/, `${rel} must not canonical to legacy woodright.ru`)
}

const envExample = read(".env.example")
assert.match(envExample, /WOODRIGHT_INDEXING_MODE/)
assert.doesNotMatch(envExample, /NEXT_PUBLIC_WOODRIGHT_INDEXING_MODE/)

console.log("indexing-policy.fidelity: ok")
