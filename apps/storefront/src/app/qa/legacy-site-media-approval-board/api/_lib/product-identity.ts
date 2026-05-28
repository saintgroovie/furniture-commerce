import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { getDataRepoRoot, readJsonFile } from "./data-repo-root"
import { getEmergencyFixRepoResolution } from "./emergency-fix-repo-root"
import {
  extractMotifFromTitle,
  parseWwLegacyTitle,
  pickProductDecor,
  type DecorConfidence,
  type DecorSource,
  type ProductDecor,
} from "./product-decor"
import { normalizeTopLevelCollection } from "../../approval-board-ww-taxonomy"

export type { DecorConfidence, DecorSource, ProductDecor }

export type TitleSource = "price_list" | "seed_products" | "normalized" | "filename_guess" | "unknown"

export type ProductIdentity = {
  handle: string
  sku: string | null
  product_title: string | null
  product_title_raw: string | null
  product_type_title: string | null
  product_title_source: TitleSource
  product_identity_source: TitleSource
  title_confidence: "high" | "low"
  collection: string | null
  collection_label: string | null
  category: string | null
  dimensions_label: string | null
  is_willie_winkie: boolean
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  resolved_motif: string | null
  legacy_metadata_mismatch: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  catalog_code_label: string | null
  motif_source: DecorSource
  motif_confidence: DecorConfidence
  motif_mismatch: boolean
  decor_motif: string | null
  decor_motif_expected: string | null
  decor_motif_observed: string | null
  decor_source: DecorSource
  decor_confidence: DecorConfidence
  decor_mismatch: boolean
}

const COLLECTION_LABELS: Record<string, string> = {
  "country-london-paris": "Country London Paris",
  "willie-winkie": "Willie Winkie",
  oliver: "Oliver",
  oxford: "Oxford",
  monchelsea: "Monchelsea",
  provence: "Provence",
  "princess-rose": "Princess Rose",
  greenwich: "Greenwich",
}

type SeedRow = {
  medusa_product_handle?: string
  product_code_normalized?: string
  medusa_product_title?: string
  canonical_name?: string
  medusa_collection_handle?: string
  medusa_collection_title?: string
  medusa_category_handle?: string
  medusa_category_title?: string
  workbook_row_key?: string
  dimensions_normalized?: { height_mm?: number; width_mm?: number; depth_mm?: number }
}

type BoardProduct = {
  handle: string
  sku?: string
  collection?: string
  title?: string
  qa_product_source?: string
}

function formatDimensions(d?: SeedRow["dimensions_normalized"]): string | null {
  if (!d?.height_mm && !d?.width_mm && !d?.depth_mm) return null
  const parts = [d.height_mm, d.width_mm, d.depth_mm].filter((x) => x != null)
  if (!parts.length) return null
  return `${parts.join("×")} мм`
}

function legacyCacheDirs(emergencyRoot: string | null, dataRoot: string | null): string[] {
  const dirs: string[] = []
  if (emergencyRoot) {
    dirs.push(path.join(emergencyRoot, "tmp", "legacy-site-media-rebuild", "cache", "html"))
  }
  if (dataRoot) {
    dirs.push(path.join(dataRoot, "data", "raw", "legacy", "cache"))
  }
  return dirs.filter((d) => fs.existsSync(d))
}

function titleFromLegacyHtml(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>\s*(?:<bdi>)?\s*([^<]+)/i)?.[1]?.trim()
  if (h1) return h1.replace(/\s+/g, " ")
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1]
  if (!titleTag) return null
  const parts = titleTag.split("::").map((s) => s.trim())
  const last = parts[parts.length - 1]?.replace(/\s*-\s*Woodright.*$/i, "").trim()
  return last || null
}

function readLegacyTitleForUrl(url: string, cacheDirs: string[]): string | null {
  const ck = crypto.createHash("md5").update(url).digest("hex")
  for (const dir of cacheDirs) {
    const file = path.join(dir, `${ck}.html`)
    if (!fs.existsSync(file)) continue
    try {
      const title = titleFromLegacyHtml(fs.readFileSync(file, "utf8"))
      if (title) return title
    } catch {
      /* ignore */
    }
  }
  for (const dir of cacheDirs) {
    try {
      const slug = url.split("/").filter(Boolean).pop() || ""
      if (!slug) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".html")) continue
        const html = fs.readFileSync(path.join(dir, f), "utf8")
        if (html.includes(slug)) {
          const title = titleFromLegacyHtml(html)
          if (title) return title
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

const SLUG_WORDS: [RegExp, string][] = [
  [/komod/i, "Комод"],
  [/krovat/i, "Кровать"],
  [/shkaf/i, "Шкаф"],
  [/stellazh/i, "Стеллаж"],
  [/tumb/i, "Тумба"],
  [/stol/i, "Стол"],
  [/banket/i, "Банкетка"],
]

function titleFromUrlSlug(url: string): string | null {
  const slug = decodeURIComponent(url.split("/").filter(Boolean).pop() || "").toLowerCase()
  if (!slug) return null
  const words: string[] = []
  for (const [re, label] of SLUG_WORDS) {
    if (re.test(slug)) words.push(label)
  }
  if (/vysok/i.test(slug)) words.push("высокий")
  if (/bolsh/i.test(slug)) words.push("большой")
  if (/dvuhdver/i.test(slug)) words.push("2-дверный")
  if (/trehdver/i.test(slug)) words.push("3-дверный")
  if (!words.length) return null
  return [...new Set(words)].join(" ")
}

function pickTitle(
  handle: string,
  seed: SeedRow | undefined,
  board: BoardProduct | undefined,
  invName: string | null,
  legacyTitle: string | null,
  legacyUrl: string | null
): { title: string | null; source: TitleSource; confidence: "high" | "low" } {
  if (seed?.medusa_product_title || seed?.canonical_name) {
    const src: TitleSource = seed.workbook_row_key ? "price_list" : "seed_products"
    return {
      title: seed.medusa_product_title || seed.canonical_name || null,
      source: src,
      confidence: "high",
    }
  }
  if (board?.title) {
    return { title: board.title, source: "normalized", confidence: "high" }
  }
  if (invName) {
    return { title: invName, source: "normalized", confidence: "high" }
  }
  if (legacyTitle) {
    return { title: legacyTitle, source: "normalized", confidence: "high" }
  }
  const guessed = legacyUrl ? titleFromUrlSlug(legacyUrl) : titleFromUrlSlug(handle)
  if (guessed) {
    return { title: guessed, source: "filename_guess", confidence: "low" }
  }
  return { title: null, source: "unknown", confidence: "low" }
}

export function buildProductIdentities(
  handles: string[],
  sourcePagesByHandle: Record<string, string[]>,
  collectionByHandle: Record<string, string> = {}
): Record<string, ProductIdentity> {
  const { dataRepoRoot } = getDataRepoRoot()
  const emergency = getEmergencyFixRepoResolution()
  const repoRoot = dataRepoRoot
  const cacheDirs = legacyCacheDirs(emergency.repoRoot, repoRoot)

  const seeds = repoRoot
    ? readJsonFile<SeedRow[]>(repoRoot, "data/normalized/seed-products.json") || []
    : []
  const boardDoc = repoRoot
    ? readJsonFile<{ products: BoardProduct[] }>(repoRoot, "data/normalized/legacy-media-board-products.json")
    : null
  const inv = repoRoot
    ? readJsonFile<{ items: { handle_hint?: string; product_name_hint?: string }[] }>(
        repoRoot,
        "data/normalized/legacy-media-inventory.json"
      )
    : null

  const seedByHandle = new Map<string, SeedRow>()
  for (const s of seeds) {
    const h = (s.medusa_product_handle || "").toLowerCase()
    if (h) seedByHandle.set(h, s)
  }

  const boardByHandle = new Map<string, BoardProduct>()
  for (const p of boardDoc?.products || []) {
    if (p.handle) boardByHandle.set(p.handle.toLowerCase(), p)
  }

  const invNameByHandle = new Map<string, string>()
  for (const item of inv?.items || []) {
    const h = (item.handle_hint || "").toLowerCase()
    const n = (item.product_name_hint || "").trim()
    if (h && n && !invNameByHandle.has(h)) invNameByHandle.set(h, n)
  }

  const out: Record<string, ProductIdentity> = {}

  for (const handle of handles) {
    const h = handle.toLowerCase()
    const seed = seedByHandle.get(h)
    const board = boardByHandle.get(h)
    const pages = sourcePagesByHandle[h] || []

    let legacyTitle: string | null = null
    let legacyUrl: string | null = null
    for (const page of pages) {
      if (!page.includes("woodright.ru")) continue
      legacyUrl = legacyUrl || page
      const t = readLegacyTitleForUrl(page, cacheDirs)
      if (t) {
        legacyTitle = t
        break
      }
    }

    const picked = pickTitle(h, seed, board, invNameByHandle.get(h) || null, legacyTitle, legacyUrl)
    const collection = normalizeTopLevelCollection(
      h,
      seed?.medusa_collection_handle || board?.collection || collectionByHandle[h] || null
    )
    const collectionLabel =
      seed?.medusa_collection_title ||
      (collection ? COLLECTION_LABELS[collection] || collection : null)

    const decor = pickProductDecor({
      handle: h,
      collection,
      productTitle: picked.title,
      titleSource: picked.source,
    })

    const wwParts = decor.is_willie_winkie
      ? parseWwLegacyTitle(picked.title, decor.expected_motif_from_sku_prefix)
      : null
    const productTypeTitle = decor.is_willie_winkie
      ? wwParts?.product_type_title ||
        seed?.canonical_name ||
        (seed?.medusa_product_title && !extractMotifFromTitle(seed.medusa_product_title)
          ? seed.medusa_product_title
          : null) ||
        board?.title ||
        null
      : picked.title

    const wwCollection =
      collection === "willie-winkie" || decor.is_willie_winkie ? "willie-winkie" : collection
    const wwCollectionLabel =
      wwCollection === "willie-winkie"
        ? COLLECTION_LABELS["willie-winkie"]
        : collectionLabel

    out[h] = {
      handle: h,
      sku: seed?.product_code_normalized || board?.sku || h.toUpperCase(),
      product_title: productTypeTitle || picked.title,
      product_title_raw: picked.title,
      product_type_title: productTypeTitle,
      product_title_source: picked.source,
      product_identity_source: picked.source,
      title_confidence: picked.confidence,
      collection: wwCollection,
      collection_label: wwCollectionLabel,
      category: seed?.medusa_category_title || seed?.medusa_category_handle || null,
      dimensions_label: formatDimensions(seed?.dimensions_normalized),
      is_willie_winkie: decor.is_willie_winkie,
      expected_motif_from_sku_prefix: decor.expected_motif_from_sku_prefix,
      legacy_page_motif: decor.legacy_page_motif,
      resolved_motif: decor.resolved_motif,
      legacy_metadata_mismatch: decor.legacy_metadata_mismatch,
      motif_subcollection: decor.motif_subcollection,
      motif_subcollection_expected: decor.motif_subcollection_expected,
      motif_subcollection_observed: decor.motif_subcollection_observed,
      catalog_code_label: decor.catalog_code_label || wwParts?.catalog_code_label || null,
      motif_source: decor.motif_source,
      motif_confidence: decor.motif_confidence,
      motif_mismatch: decor.motif_mismatch,
      decor_motif: decor.decor_motif,
      decor_motif_expected: decor.decor_motif_expected,
      decor_motif_observed: decor.decor_motif_observed,
      decor_source: decor.decor_source,
      decor_confidence: decor.decor_confidence,
      decor_mismatch: decor.decor_mismatch,
    }
  }

  return out
}

export function titleSourceLabel(source: TitleSource): string {
  const map: Record<TitleSource, string> = {
    price_list: "price_list",
    seed_products: "seed",
    normalized: "normalized",
    filename_guess: "filename_guess",
    unknown: "unknown",
  }
  return map[source] || source
}
