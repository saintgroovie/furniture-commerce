/**
 * Catalog scan: SKU with assign-prefill color variants but missing finish metadata on product.
 * Read-only via Product module (no Store API).
 *
 *   npx medusa exec ./src/scripts/forensic-missing-color-metadata-scan.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { listPublishedProductsPaginated } from "../lib/dimension-swatch-hex"

const PSEUDO_NEEDS_COLOR = "__needs_color__"
const MAIN_PREFILL = "tmp/media-ops-codex-review/assign-prefill/v2board-prefill-state.json"
const CLP_PREFILL = "tmp/media-ops-codex-review/clp-assign-prefill/prefill-v2board-state.json"

type V2ProductState = {
  handle: string
  rolesByVariant: Record<string, Record<string, string | null | undefined>>
  galleriesByVariant: Record<string, string[]>
}

type Persisted = { productStates: Record<string, V2ProductState> }

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function exportableVariantKeys(state: V2ProductState): string[] {
  const keys = new Set<string>()
  for (const k of Object.keys(state.rolesByVariant)) keys.add(k)
  for (const k of Object.keys(state.galleriesByVariant)) keys.add(k)
  return [...keys].filter((k) => k !== PSEUDO_NEEDS_COLOR)
}

function prefillColorCount(state: V2ProductState): number {
  return exportableVariantKeys(state).filter((vk) => {
    const roles = state.rolesByVariant[vk] ?? {}
    const hasMain = Boolean(roles.main)
    const galleryLen = state.galleriesByVariant[vk]?.length ?? 0
    return hasMain || galleryLen > 0
  }).length
}

function extractColorToken(url: string): string | null {
  const hay = (url.split("/").pop() ?? url).toLowerCase()
  const explicit = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  if (explicit?.[1]) return explicit[1].toLowerCase()
  const named = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory|dark)(?:[-_.]|$)/i
  )
  return named?.[1]?.toLowerCase() ?? null
}

function loadMergedPrefill(root: string): Persisted {
  const merged = JSON.parse(fs.readFileSync(path.join(root, MAIN_PREFILL), "utf8")) as Persisted
  const clpPath = path.join(root, CLP_PREFILL)
  if (fs.existsSync(clpPath)) {
    const clp = JSON.parse(fs.readFileSync(clpPath, "utf8")) as Persisted
    merged.productStates = { ...merged.productStates, ...clp.productStates }
  }
  return merged
}

function executionCount(meta: Record<string, unknown>): number {
  for (const k of [
    "paint_finish_executions",
    "finish_color_executions",
    "fabric_upholstery_executions",
  ]) {
    const arr = meta[k]
    if (Array.isArray(arr) && arr.length >= 2) return arr.length
  }
  return 0
}

export default async function forensicMissingColorMetadataScan({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const root = repoRoot()
  const prefill = loadMergedPrefill(root)
  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await listPublishedProductsPaginated(
    (filters, config) => productModule.listProducts(filters, config),
    { status: "published" },
    ["images"]
  )

  const issues: Array<{
    handle: string
    id: string | null
    title: string
    prefill_colors: number
    metadata_executions: number
    attached_color_tokens: number
    image_files: string[]
    reason: string
  }> = []

  const productByHandle = new Map<string, (typeof listed)[number]>()
  for (const p of listed ?? []) {
    const h = (p.handle ?? "").toLowerCase()
    if (h) productByHandle.set(h, p)
  }

  for (const [handle, state] of Object.entries(prefill.productStates)) {
    const prefillColors = prefillColorCount(state)
    if (prefillColors < 2) continue

    const p = productByHandle.get(handle.toLowerCase())
    const meta = (p?.metadata ?? {}) as Record<string, unknown>
    const metaExec = executionCount(meta)

    const urls = p
      ? [
          ...(typeof p.thumbnail === "string" ? [p.thumbnail] : []),
          ...((p.images ?? [])
            .map((i) => i?.url)
            .filter((u): u is string => typeof u === "string")),
        ]
      : []
    const tokens = new Set<string>()
    for (const u of urls) {
      const t = extractColorToken(u)
      if (t) tokens.add(t)
    }
    const files = urls.map((u) => u.split("/").pop() ?? u)

    if (metaExec >= 2) continue

    let reason = "prefill_has_colors_metadata_missing"
    if (!p) {
      reason = "prefill_product_not_in_db"
    } else if (tokens.size < 2 && files.some((f) => /gallery_\d+/i.test(f))) {
      reason = "gallery_only_filenames_no_color_tokens"
    } else if (tokens.size >= 2) {
      reason = "filename_tokens_present_but_metadata_not_promoted"
    }

    issues.push({
      handle,
      id: p?.id ?? null,
      title: String(p?.title ?? ""),
      prefill_colors: prefillColors,
      metadata_executions: metaExec,
      attached_color_tokens: tokens.size,
      image_files: files.slice(0, 8),
      reason,
    })
  }

  issues.sort((a, b) => a.handle.localeCompare(b.handle))

  const outDir = path.join(root, "tmp/missing-color-metadata-scan")
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, "issues.json")
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        scanned_at: new Date().toISOString(),
        total_issues: issues.length,
        by_reason: Object.fromEntries(
          [...new Set(issues.map((i) => i.reason))].map((r) => [
            r,
            issues.filter((i) => i.reason === r).length,
          ])
        ),
        issues,
      },
      null,
      2
    )
  )

  logger.info(`Wrote ${issues.length} issues → ${outPath}`)
  for (const row of issues.slice(0, 25)) {
    logger.info(
      `${row.handle}: prefill=${row.prefill_colors} meta=${row.metadata_executions} tokens=${row.attached_color_tokens} [${row.reason}]`
    )
  }
  if (issues.length > 25) logger.info(`… and ${issues.length - 25} more`)
}
