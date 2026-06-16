import * as fs from "fs"
import * as path from "path"
import { normalizeBasenameForDedupe } from "../../../legacy-media-assignment-board-v2/legacy-board-v2-dedupe"
import type { InvItem } from "../../../legacy-media-assignment-board-v2/legacy-board-v2-types"

export type DuplicateMatch = {
  inventory_id: string
  filename: string
  match_kind: "exact_basename" | "normalized_basename"
}

export type ExistingMediaPreview = {
  url: string
  basename: string
  source: "board_product" | "candidate_pool"
}

export type SkuContext = {
  handle: string | null
  title: string | null
  collection: string | null
  in_assignment_board: boolean
  assignment_board_url: string | null
  candidate_pool_count: number
  existing_media: ExistingMediaPreview[]
}

export type OrphanEnrichment = {
  duplicate_evidence: {
    has_evidence: boolean
    matches: DuplicateMatch[]
  }
  sku_context: SkuContext
  precheck_summary: string
}

type BoardProduct = {
  handle: string
  title: string | null
  collection: string
  image_urls: string[]
}

type CandidateEntry = {
  inventory_id: string
  top_candidate: {
    medusa_product_handle: string
  } | null
}

function basenameUrl(u: string): string {
  const s = String(u ?? "").split("?")[0]
  const parts = s.split("/")
  return parts[parts.length - 1] || ""
}

function loadJson<T>(abs: string): T | null {
  if (!fs.existsSync(abs)) return null
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as T
  } catch {
    return null
  }
}

function loadBoardProducts(repoRoot: string): BoardProduct[] {
  const boardAbs = path.join(repoRoot, "data/normalized/legacy-media-board-products.json")
  const seedAbs = path.join(repoRoot, "data/normalized/seed-products.json")
  const useBoard = fs.existsSync(boardAbs)
  const abs = useBoard ? boardAbs : seedAbs
  const raw = loadJson<{ products?: unknown[] } | unknown[]>(abs)
  if (!raw) return []

  const rows = useBoard
    ? ((raw as { products?: unknown[] }).products ?? [])
    : Array.isArray(raw)
      ? raw
      : []

  return rows.map((r) => {
    const row = r as Record<string, unknown>
    const handle = String(row.handle ?? row.medusa_product_handle ?? "").trim().toLowerCase()
    const urls: string[] = []
    for (const u of (row.image_urls as string[] | undefined) ?? []) urls.push(String(u))
    if (row.thumbnail_url) urls.push(String(row.thumbnail_url))
    if (row.main_image_url) urls.push(String(row.main_image_url))
    for (const im of (row.images as { url?: string }[] | undefined) ?? []) {
      if (im?.url) urls.push(String(im.url))
    }
    return {
      handle,
      title:
        row.title != null
          ? String(row.title)
          : row.medusa_product_title != null
            ? String(row.medusa_product_title)
            : null,
      collection: String(row.collection ?? row.medusa_collection_handle ?? "").trim().toLowerCase(),
      image_urls: urls,
    }
  })
}

export type EnrichmentIndexes = {
  invByExactBasename: Map<string, InvItem[]>
  invByNormBasename: Map<string, InvItem[]>
  boardByHandle: Map<string, BoardProduct>
  boardHandles: Set<string>
  poolCountByHandle: Map<string, number>
  poolPreviewByHandle: Map<string, ExistingMediaPreview[]>
}

export function buildEnrichmentIndexes(repoRoot: string): EnrichmentIndexes | null {
  const invRaw = loadJson<{ items?: InvItem[] }>(
    path.join(repoRoot, "data/normalized/legacy-media-inventory.json")
  )
  if (!invRaw?.items) return null

  const invByExactBasename = new Map<string, InvItem[]>()
  const invByNormBasename = new Map<string, InvItem[]>()
  for (const item of invRaw.items) {
    const exact = (item.filename || "").toLowerCase()
    if (exact) {
      const list = invByExactBasename.get(exact) ?? []
      list.push(item)
      invByExactBasename.set(exact, list)
    }
    const norm = normalizeBasenameForDedupe(item.filename || "")
    if (norm) {
      const list = invByNormBasename.get(norm) ?? []
      list.push(item)
      invByNormBasename.set(norm, list)
    }
  }

  const boardProducts = loadBoardProducts(repoRoot)
  const boardByHandle = new Map<string, BoardProduct>()
  const boardHandles = new Set<string>()
  for (const p of boardProducts) {
    if (!p.handle) continue
    boardByHandle.set(p.handle, p)
    boardHandles.add(p.handle)
  }

  const cmapRaw = loadJson<{ entries?: CandidateEntry[] }>(
    path.join(repoRoot, "data/normalized/legacy-media-product-candidate-map.json")
  )
  const poolCountByHandle = new Map<string, number>()
  const poolPreviewByHandle = new Map<string, ExistingMediaPreview[]>()
  const invById = new Map(invRaw.items.map((i) => [i.id, i]))

  for (const entry of cmapRaw?.entries ?? []) {
    const handle = entry.top_candidate?.medusa_product_handle?.toLowerCase()
    if (!handle) continue
    poolCountByHandle.set(handle, (poolCountByHandle.get(handle) ?? 0) + 1)
    const inv = invById.get(entry.inventory_id)
    if (!inv) continue
    const url = inv.url || inv.legacy_product_url || inv.page_url || ""
    if (!url) continue
    const previews = poolPreviewByHandle.get(handle) ?? []
    if (previews.length >= 6) continue
    previews.push({
      url: String(url),
      basename: inv.filename,
      source: "candidate_pool",
    })
    poolPreviewByHandle.set(handle, previews)
  }

  return {
    invByExactBasename,
    invByNormBasename,
    boardByHandle,
    boardHandles,
    poolCountByHandle,
    poolPreviewByHandle,
  }
}

export function enrichOrphanRow(
  basename: string,
  handleGuess: string | null,
  indexes: EnrichmentIndexes
): OrphanEnrichment {
  const handle = (handleGuess || "").trim().toLowerCase() || null
  const exact = basename.toLowerCase()
  const norm = normalizeBasenameForDedupe(basename)

  const seenIds = new Set<string>()
  const matches: DuplicateMatch[] = []

  for (const item of indexes.invByExactBasename.get(exact) ?? []) {
    if (seenIds.has(item.id)) continue
    seenIds.add(item.id)
    matches.push({
      inventory_id: item.id,
      filename: item.filename,
      match_kind: "exact_basename",
    })
  }

  for (const item of indexes.invByNormBasename.get(norm) ?? []) {
    if (seenIds.has(item.id)) continue
    seenIds.add(item.id)
    matches.push({
      inventory_id: item.id,
      filename: item.filename,
      match_kind: "normalized_basename",
    })
  }

  const product = handle ? indexes.boardByHandle.get(handle) : undefined
  const inBoard = handle ? indexes.boardHandles.has(handle) : false
  const existingMedia: ExistingMediaPreview[] = []

  if (product) {
    for (const url of product.image_urls.slice(0, 6)) {
      existingMedia.push({
        url,
        basename: basenameUrl(url),
        source: "board_product",
      })
    }
  }

  const poolPreviews = handle ? indexes.poolPreviewByHandle.get(handle) ?? [] : []
  for (const p of poolPreviews) {
    if (existingMedia.length >= 8) break
    if (existingMedia.some((e) => e.url === p.url)) continue
    existingMedia.push(p)
  }

  const poolCount = handle ? indexes.poolCountByHandle.get(handle) ?? 0 : 0

  const parts: string[] = []
  if (matches.length > 0) {
    parts.push(
      `System found ${matches.length} normalized inventory match(es) — review duplicate evidence before mapping.`
    )
  } else {
    parts.push("No normalized inventory basename match — not a known duplicate by filename.")
  }
  if (inBoard) {
    parts.push("Handle is in assignment board v2 pilot — use assignment board for role/gallery.")
  } else if (handle) {
    parts.push("Handle not in assignment board v2 pilot (108 products) — engineering precheck required.")
  } else {
    parts.push("No handle guess — cannot route to assignment board.")
  }

  return {
    duplicate_evidence: {
      has_evidence: matches.length > 0,
      matches: matches.slice(0, 8),
    },
    sku_context: {
      handle,
      title: product?.title ?? null,
      collection: product?.collection ?? null,
      in_assignment_board: inBoard,
      assignment_board_url: inBoard && handle
        ? `/qa/legacy-media-assignment-board-v2?handle=${encodeURIComponent(handle)}`
        : null,
      candidate_pool_count: poolCount,
      existing_media: existingMedia,
    },
    precheck_summary: parts.join(" "),
  }
}
