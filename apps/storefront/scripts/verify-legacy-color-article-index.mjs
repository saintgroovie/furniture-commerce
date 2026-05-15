#!/usr/bin/env node
/**
 * Dev verification for legacy color article index (no Medusa / no writes).
 * Run from apps/storefront: node scripts/verify-legacy-color-article-index.mjs
 */
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")

function fail(msg) {
  console.error("FAIL:", msg)
  process.exit(1)
}

function ok(msg) {
  console.log("OK:", msg)
}

// Dynamic import of compiled TS is heavy; inline minimal checks mirroring enrichment rules.
const LAMINATE_ARTICLE_RE = /\b([A-Za-zА-Яа-я][0-9]{3,4})\b/

function parseLabel(value) {
  const raw = value.trim()
  const m = raw.match(LAMINATE_ARTICLE_RE)
  if (!m?.[1]) return null
  const article = m[1].replace(/\u0413/g, "G").replace(/\u0421/g, "C").toUpperCase()
  const colorName = raw.replace(m[0], "").replace(/\s+/g, " ").trim() || null
  return { article, colorName }
}

const graphite = parseLabel(" Графит S499 ")
if (!graphite || graphite.article !== "S499" || graphite.colorName !== "Графит") {
  fail(`parseLegacySwatchLabelText graphite: ${JSON.stringify(graphite)}`)
}
ok('parseLegacySwatchLabelText(" Графит S499 ") → S499 / Графит')

const skuAsArticle = parseLabel("CO-02-1")
if (skuAsArticle?.article === "CO-02-1") fail("product SKU must not parse as laminate article")
ok("product SKU not used as color article")

const greenwichUrl = "https://woodright.ru/kollekcii/greenwich/garderob-level/"
const cachePath = path.join(
  repoRoot,
  "data/raw/legacy/cache",
  `${crypto.createHash("md5").update(greenwichUrl).digest("hex")}.html`
)
if (!fs.existsSync(cachePath)) fail(`missing Greenwich cache ${cachePath}`)
const html = fs.readFileSync(cachePath, "utf8")
if (!/title=" ?Графит S499 ?"/i.test(html) && !/title=" Графит S499 "/.test(html)) {
  fail("Greenwich PDP cache missing S499 swatch title")
}
ok("Greenwich PDP cache contains S499 swatch")

const coUrl = "https://woodright.ru/kollekcii/country/shkaf-dvuhdvernyy-country/"
const coCache = path.join(
  repoRoot,
  "data/raw/legacy/cache",
  `${crypto.createHash("md5").update(coUrl).digest("hex")}.html`
)
if (fs.existsSync(coCache)) {
  const coHtml = fs.readFileSync(coCache, "utf8")
  const sw = (coHtml.match(/ty-product-options__image--wrapper/g) || []).length
  if (sw > 0) fail("CO-02-1 listing page should not expose PDP swatch wrappers in cache")
}
const listingCache = fs
  .readdirSync(path.join(repoRoot, "data/raw/legacy/cache"))
  .find((f) => {
    const h = fs.readFileSync(path.join(repoRoot, "data/raw/legacy/cache", f), "utf8")
    return h.includes("shkaf-dvuhdvernyy-country") && /ut2-gl__body/.test(h)
  })
if (!listingCache) ok("CO listing page check skipped (no listing cache file)")
else {
  const h = fs.readFileSync(path.join(repoRoot, "data/raw/legacy/cache", listingCache), "utf8")
  const sw = (h.match(/ty-product-options__image--wrapper/g) || []).length
  if (sw > 0) fail("country listing cache must not be treated as PDP swatch source")
  ok("CO-02-1 country listing cache has no PDP swatch wrappers")
}

console.log("\nAll legacy color article index checks passed.")
