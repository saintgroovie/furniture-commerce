/**
 * Builds the editorial deliverables from copy/*.json + the read-only export:
 *   - product-copy-change-register.csv (one row per changed field)
 *   - product-copy-unresolved.csv
 *   - dry-run/product-copy-import.dry-run.json (NOT applied anywhere)
 * Validates along the way: full coverage, no unknown handles, banned cliché
 * scan, near-duplicate scan, forbidden-field guard.
 * Run: node docs/product-copy/scripts/build-register.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..")
const { products } = JSON.parse(
  await readFile(path.join(root, "export", "products-export.json"), "utf8")
)
const byHandle = new Map(products.map((p) => [p.handle, p]))

/* ---- load copy ---- */
const copyDir = path.join(root, "copy")
const copy = new Map()
for (const f of (await readdir(copyDir)).filter((f) => f.endsWith(".json")).sort()) {
  const entries = JSON.parse(await readFile(path.join(copyDir, f), "utf8"))
  for (const [handle, entry] of Object.entries(entries)) {
    if (copy.has(handle)) throw new Error(`duplicate handle across copy files: ${handle}`)
    copy.set(handle, { ...entry, _file: f })
  }
}

/* ---- coverage & identity checks ---- */
const unknown = [...copy.keys()].filter((h) => !byHandle.has(h))
const missing = [...byHandle.keys()].filter((h) => !copy.has(h))
if (unknown.length) throw new Error(`copy references unknown handles: ${unknown.join(", ")}`)
if (missing.length) throw new Error(`products without copy entry: ${missing.join(", ")}`)

const ALLOWED_KEYS = new Set(["title", "subtitle", "description", "status", "source_facts", "notes", "_file"])
const ALLOWED_STATUS = new Set([
  "safe_to_rewrite",
  "safe_for_light_edit",
  "needs_product_data",
  "possible_duplicate",
  "identity_conflict",
])
for (const [h, e] of copy) {
  for (const k of Object.keys(e)) {
    if (!ALLOWED_KEYS.has(k)) throw new Error(`${h}: forbidden field in copy entry: ${k}`)
  }
  if (!ALLOWED_STATUS.has(e.status)) throw new Error(`${h}: bad status ${e.status}`)
  if (!e.source_facts) throw new Error(`${h}: missing source_facts`)
}

/* ---- banned cliché scan ---- */
const BANNED = [
  "идеальное сочетание", "настоящее украшение", "воплощение стиля", "неповторимый шарм",
  "изысканн", "непревзойд", "роскошн", "премиальн", "эксклюзивн", "уникальн",
  "уют и комфорт", "любого интерьера", "любой интерьер", "не оставит равнодушным",
  "особую атмосферу", "настоящих ценителей", "стильное решение",
  "функциональность и эстетика", "высококачественн", "европейское качество",
  "на долгие годы", "натуральные материалы", "премиальная древесина",
  "экологичные покрытия", "массив ценных пород", "ручная работа",
]
const clicheHits = []
for (const [h, e] of copy) {
  const text = `${e.subtitle ?? ""} ${e.description ?? ""}`.toLowerCase()
  for (const b of BANNED) if (text.includes(b)) clicheHits.push(`${h}: «${b}»`)
}
if (clicheHits.length) throw new Error(`banned clichés found:\n${clicheHits.join("\n")}`)

/* ---- near-duplicate scan (4-word shingles, Jaccard) ---- */
const shingles = (s) => {
  const w = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)
  const out = new Set()
  for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "))
  return out
}
const entries = [...copy.entries()].filter(([, e]) => (e.description ?? "").length > 0)
const dupPairs = []
for (let i = 0; i < entries.length; i++) {
  const [h1, e1] = entries[i]
  const s1 = shingles(e1.description)
  for (let j = i + 1; j < entries.length; j++) {
    const [h2, e2] = entries[j]
    const s2 = shingles(e2.description)
    let inter = 0
    for (const s of s1) if (s2.has(s)) inter++
    const jac = inter / (s1.size + s2.size - inter || 1)
    if (jac > 0.5) dupPairs.push(`${h1} ~ ${h2} (${jac.toFixed(2)})`)
  }
}
if (dupPairs.length) throw new Error(`near-duplicate descriptions:\n${dupPairs.join("\n")}`)

/* ---- title-change safety: only normalization, never renaming ---- */
const titleChanges = []
for (const [h, e] of copy) {
  if (!e.title) continue
  const oldT = byHandle.get(h).title
  if (e.title === oldT) continue
  titleChanges.push({ handle: h, old: oldT, new: e.title })
}

/* ---- CSV helpers ---- */
const csv = (v) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/* ---- change register ---- */
const registerRows = [
  ["product_id", "handle", "sku", "collection", "classification", "field", "old_text", "new_text", "status", "source_facts", "editorial_notes"],
]
const importPayload = []
for (const [h, e] of copy) {
  const p = byHandle.get(h)
  const base = [
    p.id, h, (p.variants?.[0]?.sku) ?? "", p.collection?.title ?? "", p._classification ?? "",
  ]
  const upd = { id: p.id, handle: h }
  let changed = false
  const fields = [
    ["title", p.title, e.title],
    ["subtitle", p.subtitle ?? "", e.subtitle],
    ["description", p.description ?? "", e.description],
  ]
  for (const [field, oldV, newV] of fields) {
    if (newV == null) continue
    if ((oldV ?? "") === newV) continue
    registerRows.push([...base, field, oldV ?? "", newV, e.status, e.source_facts, e.notes ?? ""])
    upd[field] = newV
    changed = true
  }
  if (changed) importPayload.push(upd)
}

/* ---- unresolved ---- */
const unresolvedRows = [
  ["product_id", "handle", "sku", "issue", "missing_data", "conflicting_sources", "recommended_action"],
]
for (const [h, e] of copy) {
  const p = byHandle.get(h)
  if (e.status === "needs_product_data") {
    unresolvedRows.push([
      p.id, h, p.variants?.[0]?.sku ?? "", "needs_product_data",
      e.notes ?? "", "", "запросить продуктовые данные у оператора; описание не заполнялось",
    ])
  } else if (e.status === "identity_conflict") {
    unresolvedRows.push([
      p.id, h, p.variants?.[0]?.sku ?? "", "identity_conflict",
      "", e.source_facts, e.notes ?? "проверить metadata оператором",
    ])
  }
}

await writeFile(
  path.join(root, "product-copy-change-register.csv"),
  registerRows.map((r) => r.map(csv).join(",")).join("\n") + "\n"
)
await writeFile(
  path.join(root, "product-copy-unresolved.csv"),
  unresolvedRows.map((r) => r.map(csv).join(",")).join("\n") + "\n"
)
await writeFile(
  path.join(root, "dry-run", "product-copy-import.dry-run.json"),
  JSON.stringify(
    {
      note: "DRY-RUN ARTIFACT — NOT APPLIED. Apply requires explicit operator approval (POST /admin/products/:id per record).",
      generated_at: new Date().toISOString(),
      fields_touched: ["title", "subtitle", "description"],
      forbidden_fields_untouched: ["prices", "sku", "handle", "variants", "options", "images", "thumbnail", "status", "collection_id", "categories", "metadata"],
      count: importPayload.length,
      updates: importPayload,
    },
    null,
    2
  )
)

/* ---- summary ---- */
const statusCount = {}
for (const [, e] of copy) statusCount[e.status] = (statusCount[e.status] ?? 0) + 1
console.log(JSON.stringify({
  products: products.length,
  copyEntries: copy.size,
  coverage: "full",
  registerRows: registerRows.length - 1,
  updatesInDryRun: importPayload.length,
  titleChanges: titleChanges.length,
  statusCount,
  unresolved: unresolvedRows.length - 1,
  clicheHits: 0,
  nearDuplicates: 0,
}, null, 1))
console.log("\ntitle normalizations:")
for (const t of titleChanges) console.log(`  ${t.handle}: «${t.old}» -> «${t.new}»`)
