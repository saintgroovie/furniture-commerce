/**
 * Broader scan: published co-/ol-/pv- (and optional prefixes) with gallery/scene
 * pools but dimension execution metadata < 2 rows.
 *
 * Optional: SCENE_ONLY_PREFIXES=co-,ol-,pv-,fa-
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  listPublishedProductsPaginated,
  SWATCH_EXECUTION_METADATA_KEYS,
} from "../lib/dimension-swatch-hex"

const DEFAULT_PREFIXES = ["co-", "ol-", "pv-"]

function prefixList(): string[] {
  const raw = (process.env.SCENE_ONLY_PREFIXES ?? "").trim()
  if (!raw) return DEFAULT_PREFIXES
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function extractColorToken(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const named = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory|dark)(?:[-_.]|$)/i
  )
  return named?.[1]?.toLowerCase() ?? null
}

function executionCount(meta: Record<string, unknown>): number {
  let max = 0
  for (const key of SWATCH_EXECUTION_METADATA_KEYS) {
    const arr = meta[key]
    if (Array.isArray(arr) && arr.length > max) max = arr.length
  }
  return max
}

export default async function forensicSceneOnlyMissingColors({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const prefixes = prefixList()
  const listed = await listPublishedProductsPaginated(
    (filters, config) => container.resolve(Modules.PRODUCT).listProducts(filters, config),
    { status: "published" },
    ["images"]
  )

  const issues: Array<{
    handle: string
    title: string
    collection: string | null
    meta_exec: number
    url_color_tokens: number
    gallery_only: boolean
    files: string[]
  }> = []

  for (const p of listed) {
    const handle = (p.handle ?? "").toLowerCase()
    if (!prefixes.some((px) => handle.startsWith(px))) continue

    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const metaExec = executionCount(meta)
    if (metaExec >= 2) continue

    const urls = [
      ...(typeof p.thumbnail === "string" ? [p.thumbnail] : []),
      ...((p.images ?? []).map((i) => i?.url).filter((u): u is string => typeof u === "string")),
    ]
    const tokens = new Set<string>()
    for (const u of urls) {
      const t = extractColorToken(u)
      if (t) tokens.add(t)
    }
    const files = urls.map((u) => u.split("/").pop() ?? u)
    const galleryOnly =
      files.length > 0 && files.every((f) => /gallery_\d+|_main\./i.test(f) || !extractColorToken(f))

    if (!galleryOnly && tokens.size < 2) continue
    if (urls.length < 3) continue

    const collection =
      typeof meta.collection === "string" && meta.collection.trim()
        ? meta.collection.trim()
        : null

    issues.push({
      handle,
      title: String(p.title ?? ""),
      collection,
      meta_exec: metaExec,
      url_color_tokens: tokens.size,
      gallery_only: galleryOnly,
      files: files.slice(0, 6),
    })
  }

  issues.sort((a, b) => a.handle.localeCompare(b.handle))
  const root = path.resolve(process.cwd(), "../..")
  const out = path.join(root, "tmp/missing-color-metadata-scan/scene-only-missing.json")
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const byCollection: Record<string, number> = {}
  for (const row of issues) {
    const key = row.collection ?? "(none)"
    byCollection[key] = (byCollection[key] ?? 0) + 1
  }
  fs.writeFileSync(
    out,
    JSON.stringify({ total: issues.length, by_collection: byCollection, prefixes, issues }, null, 2)
  )
  logger.info(`Wrote ${issues.length} scene-only gaps → ${out}`)
  for (const row of issues.slice(0, 30)) {
    logger.info(
      `${row.handle}: meta=${row.meta_exec} tokens=${row.url_color_tokens} gallery_only=${row.gallery_only}`
    )
  }
}
