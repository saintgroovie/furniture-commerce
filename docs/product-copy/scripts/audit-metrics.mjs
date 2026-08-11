/**
 * Audit metrics over the read-only export: field coverage, duplicates,
 * legacy junk markers. Prints a JSON summary; no file mutations.
 * Run: node docs/product-copy/scripts/audit-metrics.mjs
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const { products } = JSON.parse(
  await readFile(path.join(here, "..", "export", "products-export.json"), "utf8")
)

const norm = (s) => (s ?? "").toString().trim()
const byCollection = {}
const byClass = {}
const byStatus = {}
const descMap = new Map()
let withDesc = 0
let withSubtitle = 0
let emptyDesc = 0

for (const p of products) {
  const col = p.collection?.title ?? p.metadata?.collection_label ?? "(none)"
  byCollection[col] = (byCollection[col] ?? 0) + 1
  byClass[p._classification ?? "(none)"] = (byClass[p._classification ?? "(none)"] ?? 0) + 1
  byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  const d = norm(p.description)
  if (d) {
    withDesc++
    const key = d.toLowerCase()
    if (!descMap.has(key)) descMap.set(key, [])
    descMap.get(key).push(p.handle)
  } else emptyDesc++
  if (norm(p.subtitle)) withSubtitle++
}

const dupGroups = [...descMap.entries()].filter(([, hs]) => hs.length > 1)

console.log(
  JSON.stringify(
    {
      total: products.length,
      byStatus,
      byClass,
      byCollection,
      withDescription: withDesc,
      emptyDescription: emptyDesc,
      withSubtitle,
      duplicateDescriptionGroups: dupGroups.length,
      duplicateGroupsDetail: dupGroups.map(([text, hs]) => ({
        sample: text.slice(0, 80),
        count: hs.length,
        handles: hs.slice(0, 30),
      })),
      descriptionSamples: products
        .filter((p) => norm(p.description))
        .slice(0, 8)
        .map((p) => ({ handle: p.handle, title: p.title, description: norm(p.description).slice(0, 200) })),
      titleSamples: products.slice(0, 40).map((p) => `${p.handle} :: ${p.title} :: subtitle=${norm(p.subtitle) || "-"}`),
    },
    null,
    1
  )
)
