/**
 * Catalog SEO regression over a Store API products dump (read-only).
 *
 *   yarn dlx -q tsx scripts/catalog-seo-regression.ts --products /path/products.json [--out dir] [--strict]
 *
 * Input: `{ "products": [...] }` from `/store/products?fields=*metadata,...` (any page merge).
 * Output: `<out>/catalog-seo-audit.{json,md}`. `--strict` exits 1 on any issue except
 * `duplicate_seo_name` rows listed in the HOLD set below.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { auditCatalogSeo, type SeoIssueClass } from "../src/lib/catalog-seo-audit"

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

const productsPath = arg("--products")
if (!productsPath) {
  console.error("usage: catalog-seo-regression.ts --products <products.json> [--out dir] [--strict]")
  process.exit(2)
}
const outDir = resolve(arg("--out") ?? "../../tmp/catalog-seo")
const strict = process.argv.includes("--strict")

const raw = JSON.parse(readFileSync(productsPath, "utf8")) as { products?: unknown }
if (!Array.isArray(raw.products)) {
  console.error("products.json must contain a `products` array")
  process.exit(2)
}

const { rows, summary } = auditCatalogSeo(raw.products as Record<string, unknown>[])
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, "catalog-seo-audit.json"), JSON.stringify({ summary, rows }, null, 1))

const lines = [
  "# Catalog SEO regression",
  "",
  "| check | count |",
  "|---|---|",
  ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`),
  "",
  "| handle | seo_name | meta (len) | issues |",
  "|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.handle} | ${r.seo_name} | ${r.meta_description.replace(/\|/g, "/")} (${r.meta_length}) | ${r.issues.join(", ")} |`
  ),
]
writeFileSync(resolve(outDir, "catalog-seo-audit.md"), `${lines.join("\n")}\n`)

console.log(JSON.stringify(summary, null, 1))
const failing = rows.filter((r) => r.issues.length > 0)
for (const r of failing.slice(0, 40)) console.log(`${r.handle}: ${r.issues.join(", ")} | ${r.seo_name} | ${r.meta_description}`)
if (strict && failing.length > 0) {
  const classes = new Set<SeoIssueClass>(failing.flatMap((r) => r.issues))
  console.error(`FAIL: ${failing.length} rows; classes: ${[...classes].join(", ")}`)
  process.exit(1)
}
