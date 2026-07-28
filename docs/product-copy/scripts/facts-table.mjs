/**
 * Compact per-product facts view from the read-only export: everything an
 * editor may rely on (and nothing else). Prints TSV to stdout.
 * Run: node docs/product-copy/scripts/facts-table.mjs [--json handle]
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const { products } = JSON.parse(
  await readFile(path.join(here, "..", "export", "products-export.json"), "utf8")
)

const wantJson = process.argv[2] === "--json"
if (wantJson) {
  const handle = process.argv[3]
  const p = products.find((x) => x.handle === handle)
  console.log(JSON.stringify(p, null, 1))
  process.exit(0)
}

for (const p of products) {
  const m = p.metadata ?? {}
  const dims = m.dimensions
    ? (() => {
        const parts: string[] = []
        // Height → Width → Depth; zeros are unknown (not "?") when absent.
        for (const key of ["height_mm", "width_mm", "depth_mm"]) {
          const v = m.dimensions[key]
          if (typeof v === "number" && Number.isFinite(v) && v > 0) {
            parts.push(String(v))
          } else {
            parts.push("?")
          }
        }
        // If all unknown, show dash.
        if (parts.every((p) => p === "?")) return "-"
        return parts.join("x")
      })()
    : "-"
  const opts = (p.options ?? [])
    .map((o) => `${o.title}[${(o.values ?? []).map((v) => v.value).join("|")}]`)
    .join(" ; ")
  const cats = (p.categories ?? []).map((c) => c.name).join(",")
  console.log(
    [
      p.handle,
      p._classification,
      p.collection?.title ?? "-",
      m.collection ?? "-",
      p.title,
      m.canonical_name ?? "-",
      dims,
      cats || "-",
      `${(p.variants ?? []).length}v`,
      opts || "-",
    ].join("\t")
  )
}
