/**
 * Catalog content board (read-only): current vs proposed buyer title / description / SEO per product.
 *
 *   yarn dlx -q tsx scripts/catalog-content-board.ts \
 *     --products /path/store-products.json \
 *     [--browse /path/catalog-browse-products.json] \
 *     [--unresolved ../../docs/product-copy/product-copy-unresolved.csv] \
 *     --out ../../docs/product-copy/catalog-copy-seo-pass
 *
 * action:
 *   APPLY - rendered by storefront code from existing data (no data write)
 *   KEEP  - current copy stays
 *   HOLD  - needs owner data / copy / decision; nothing is written
 * confidence: exact (closed dictionary / verified code map) | strong (from structured metadata) | ambiguous
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  collectionTitleName,
  resolvePublicProductTitle,
  resolveTitleCollectionSlug,
  sanitizeBuyerDescription,
  SHARED_EXECUTION_NOTE,
} from "../src/lib/catalog-normalization"
import { CATEGORY_FILTER_LABELS } from "../src/lib/catalog-filters"
import { buildMaterialTierOptions } from "../src/lib/material-tiers"
import { isRequestQuoteProduct } from "../src/lib/request-quote"
import { getBuyerFacingProductTitle } from "../src/lib/product-metadata"
import {
  buildProductMetaDescription,
  getBuyerDescription,
  getProductSeoName,
} from "../src/lib/product-seo"

type Row = Record<string, unknown>

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

const productsPath = arg("--products")
const outDir = arg("--out")
if (!productsPath || !outDir) {
  console.error("usage: catalog-content-board.ts --products <json> --out <dir> [--browse <json>] [--unresolved <csv>]")
  process.exit(2)
}

const products = (JSON.parse(readFileSync(productsPath, "utf8")) as { products: Row[] }).products
const browsePath = arg("--browse")
const browse = browsePath
  ? ((JSON.parse(readFileSync(browsePath, "utf8")) as { products?: Row[] }).products ?? [])
  : []
const buyerTypeByHandle = new Map(
  browse.map((p) => {
    const m = (p.metadata ?? {}) as Row
    return [String(p.handle), String(m.buyer_item_type ?? m.category_handle ?? "")]
  })
)
const unresolvedPath = arg("--unresolved")
const unresolved = new Map<string, string>()
if (unresolvedPath && existsSync(unresolvedPath)) {
  for (const line of readFileSync(unresolvedPath, "utf8").split("\n").slice(1)) {
    const cols = line.split(",")
    if (cols[1]) unresolved.set(cols[1], cols[3] ?? "unresolved")
  }
}

const MODULE_CODE_RE = /модуль\/[А-ЯЁA-Z+]+/u
const LATIN_COLLECTION_RE = /\b(Oliver|Provence|Country|Greenwich|Monchelsea|Princess Rose|Willie Winkie|Oxford)\b/u

function meta(p: Row): Row {
  return (p.metadata && typeof p.metadata === "object" ? p.metadata : {}) as Row
}

function sku(p: Row): string {
  const v = Array.isArray(p.variants) ? (p.variants[0] as Row | undefined) : undefined
  return String(v?.sku ?? meta(p).product_code_normalized ?? "")
}

function plain(s: string | null | undefined): string {
  return (s ?? "").replace(/[\u00a0\u202f]/g, " ")
}

function cmText(mm: unknown): string | null {
  const n = typeof mm === "number" ? mm : Number(mm)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${String(Math.round(n / 10 * 10) / 10).replace(".", ",")} см`
}

function factsPack(p: Row): string {
  const d = (meta(p).dimensions ?? {}) as Row
  const parts = [
    cmText(d.width_mm) && `ширина ${cmText(d.width_mm)}`,
    cmText(d.depth_mm) && `глубина ${cmText(d.depth_mm)}`,
    cmText(d.height_mm) && `высота ${cmText(d.height_mm)}`,
  ].filter(Boolean)
  return parts.length ? `metadata.dimensions: ${parts.join(", ")}` : "metadata.dimensions: нет"
}

type BoardRow = {
  product_id: string
  handle: string
  sku: string
  current_title: string
  proposed_title: string
  collection: string
  category: string
  current_description: string
  proposed_description: string
  seo_title: string
  meta_description: string
  evidence: string
  confidence: "exact" | "strong" | "ambiguous"
  action: "APPLY" | "KEEP" | "HOLD"
  notes: string
}

const rows: BoardRow[] = []
for (const p of products) {
  if (p.status != null && p.status !== "published") continue
  const handle = String(p.handle ?? "")
  const rawTitle = String(p.title ?? "")
  const rawDescription = typeof p.description === "string" ? p.description : ""
  const slug = resolveTitleCollectionSlug(handle, meta(p))
  const resolved = resolvePublicProductTitle(p)
  const h1 = plain(getBuyerFacingProductTitle(p))
  const seoName = plain(getProductSeoName(p))
  const metaDescription = plain(
    buildProductMetaDescription(p, {
      hasOptions: (buildMaterialTierOptions(p)?.length ?? 0) > 0,
      priceMode: isRequestQuoteProduct(p) ? "quote" : "price",
    })
  )
  const visible = getBuyerDescription(p)
  const removed = sanitizeBuyerDescription(rawDescription, { title: rawTitle }).removed

  const evidence: string[] = []
  const notes: string[] = []
  let confidence: BoardRow["confidence"] = "exact"
  let action: BoardRow["action"] = "KEEP"
  const bump = (a: BoardRow["action"]) => {
    if (a === "HOLD" || (a === "APPLY" && action === "KEEP")) action = a
  }

  if (h1 !== plain(rawTitle)) {
    bump("APPLY")
    evidence.push(`title: ${resolved.notes.join("; ") || "normalized"}; model from ${slug ? `collection=${slug}` : "title"}`)
  }
  if (seoName !== h1) evidence.push(`seo name: painting from metadata.motif_slug=${String(meta(p).motif_slug)}`)
  if (MODULE_CODE_RE.test(rawTitle)) {
    confidence = "ambiguous"
    bump("HOLD")
    notes.push("модульный код Мончелси оставлен как есть: расшифровка не подтверждена")
  }

  let proposedDescription = ""
  if (visible === null && rawDescription.trim()) {
    bump("HOLD")
    if (confidence === "exact") confidence = "strong"
    evidence.push(`description: only ${removed.join(", ")}; ${factsPack(p)}`)
    notes.push("в описании только служебные строки прайса - на PDP скрыты; нужен авторский текст по фактам")
  } else if (!rawDescription.trim()) {
    bump("HOLD")
    if (confidence === "exact") confidence = "strong"
    evidence.push(`description: empty; ${factsPack(p)}`)
    notes.push("описания нет; meta берётся из имени и фактов")
  } else if (removed.length) {
    bump("APPLY")
    proposedDescription = visible ?? ""
    evidence.push(`description: removed ${removed.join(", ")}`)
  }
  if (rawDescription.includes(SHARED_EXECUTION_NOTE)) notes.push("общая фраза об исполнении: на PDP остаётся, в meta/JSON-LD не идёт")
  if (LATIN_COLLECTION_RE.test(rawDescription)) notes.push("в описании латиница в названии коллекции (H1 - кириллица); правка текста - решение владельца")
  const unresolvedIssue = unresolved.get(handle)
  if (unresolvedIssue) {
    confidence = "ambiguous"
    bump("HOLD")
    notes.push(`product-copy-unresolved: ${unresolvedIssue}`)
  }

  const buyerType = buyerTypeByHandle.get(handle) ?? ""
  rows.push({
    product_id: String(p.id ?? ""),
    handle,
    sku: sku(p),
    current_title: rawTitle,
    proposed_title: h1,
    collection: collectionTitleName(slug) ?? "",
    category: CATEGORY_FILTER_LABELS[buyerType] ?? buyerType,
    current_description: rawDescription,
    proposed_description: proposedDescription,
    seo_title: `${seoName} | Woodright`,
    meta_description: metaDescription,
    evidence: evidence.join(" | "),
    confidence,
    action,
    notes: notes.join(" | "),
  })
}
rows.sort((a, b) => a.handle.localeCompare(b.handle))

const COLS = Object.keys(rows[0] ?? {}) as Array<keyof BoardRow>
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
mkdirSync(resolve(outDir), { recursive: true })
writeFileSync(
  resolve(outDir, "content-board.csv"),
  `${[COLS.join(","), ...rows.map((r) => COLS.map((c) => csvCell(String(r[c]))).join(","))].join("\n")}\n`
)

const count = (k: keyof BoardRow, v: string) => rows.filter((r) => r[k] === v).length
const summary = {
  products: rows.length,
  action: { APPLY: count("action", "APPLY"), KEEP: count("action", "KEEP"), HOLD: count("action", "HOLD") },
  confidence: {
    exact: count("confidence", "exact"),
    strong: count("confidence", "strong"),
    ambiguous: count("confidence", "ambiguous"),
  },
  title_changed: rows.filter((r) => plain(r.current_title) !== r.proposed_title).length,
  description_sanitized: rows.filter((r) => r.proposed_description).length,
  description_needs_owner_copy: rows.filter((r) => /нужен авторский текст|описания нет/.test(r.notes)).length,
  unique_seo_titles: new Set(rows.map((r) => r.seo_title)).size,
  unique_meta_descriptions: new Set(rows.map((r) => r.meta_description)).size,
}
writeFileSync(resolve(outDir, "content-board.summary.json"), `${JSON.stringify(summary, null, 1)}\n`)
console.log(JSON.stringify(summary, null, 1))
