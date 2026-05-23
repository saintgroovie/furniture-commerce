/**
 * Legacy Media Assignment Board v2 — dry-run planner (Commit A).
 *
 * Reads one v2board export JSON (--export <path>), validates all 10 input
 * gates, resolves the product in Medusa by handle, converts source_path refs
 * to localhost static URLs, HEAD-checks each media URL, and prints a dry-run
 * plan.
 *
 * Default: dry-run only — no writes to Medusa, no DB mutations, no apply path.
 * Apply path will be added in Commit B after human review of dry-run output.
 *
 * From apps/backend:
 *   yarn legacy-v2board-media:dry-run -- --export tmp/qa-screenshots/manual-triage-export-co-08-1-fixed.json
 *
 * Exit codes:
 *   0 — dry-run plan built, all validation gates passed (warnings may exist)
 *   1 — one or more BLOCK gates failed, product ambiguous, or --apply used
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

// ── Types ──────────────────────────────────────────────────────────────────

type ReviewMeta = {
  scope?: string
  board_version?: unknown
  local_dev_only?: unknown
  production_rollout?: unknown
}

type MediaRef = {
  id: string
  filename: string
  source_path: string
  preview_status?: string
}

type VariantAllAssignment = {
  main: MediaRef
  gallery: MediaRef[]
}

type ProductAssignment = {
  handle: string
  title?: string
  collection?: string
  variants: {
    __all__: VariantAllAssignment
  }
}

type V2BoardExport = {
  version?: string | number
  exported_at?: string
  review_meta: ReviewMeta
  summary?: Record<string, unknown>
  assignments: Record<string, ProductAssignment>
}

type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: Array<{ url?: string | null }>
}

type MediaItemPlan = {
  id: string
  filename: string
  url: string | null
  url_error: string | null
  url_status: number | null
  url_ok: boolean
}

type DryRunProductPlan = {
  mode: "dry-run"
  export_path: string
  handle: string
  product_id: string
  current_thumbnail: string | null
  current_images: string[]
  planned_thumbnail: MediaItemPlan
  planned_gallery: MediaItemPlan[]
  skipped_duplicates: string[]
  warnings: string[]
  blocked_reasons: string[]
}

// ── CLI helpers ────────────────────────────────────────────────────────────

function getExportArg(): string | null {
  const args = process.argv
  const idx = args.indexOf("--export")
  if (idx === -1 || idx + 1 >= args.length) return null
  const val = args[idx + 1]
  return val && !val.startsWith("--") ? val : null
}

function resolveExportPath(exportArg: string): string {
  if (path.isAbsolute(exportArg)) return exportArg
  // Try relative to cwd (apps/backend)
  const fromCwd = path.resolve(process.cwd(), exportArg)
  if (fs.existsSync(fromCwd)) return fromCwd
  // Try relative to repo root (2 levels up from apps/backend)
  const fromRoot = path.resolve(process.cwd(), "../../", exportArg)
  return fromRoot
}

// ── Input validation (10 gates) ────────────────────────────────────────────

function validateV2BoardExport(data: V2BoardExport): string[] {
  const blocks: string[] = []
  const { review_meta, assignments } = data

  // Gate 1: board_version
  if (review_meta.board_version !== "v2board") {
    blocks.push(
      `gate_1_board_version: review_meta.board_version="${String(review_meta.board_version)}" !== "v2board"`
    )
  }

  // Gate 2: local_dev_only
  if (review_meta.local_dev_only !== true) {
    blocks.push(
      `gate_2_local_dev_only: review_meta.local_dev_only=${String(review_meta.local_dev_only)} !== true`
    )
  }

  // Gate 3: production_rollout
  if (review_meta.production_rollout !== false) {
    blocks.push(
      `gate_3_production_rollout: review_meta.production_rollout=${String(review_meta.production_rollout)} !== false`
    )
  }

  // Gate 4: exactly one product per export
  const assignmentKeys = Object.keys(assignments ?? {})
  if (assignmentKeys.length !== 1) {
    blocks.push(
      `gate_4_single_product: assignments has ${assignmentKeys.length} key(s), expected exactly 1`
    )
    // Cannot validate product-level gates without exactly 1 key
    return blocks
  }

  const assignmentKey = assignmentKeys[0] as string
  const productAssignment = assignments[assignmentKey] as ProductAssignment

  // Gate 5: variants.__all__.main with required fields
  const variantAll = productAssignment.variants?.__all__
  if (!variantAll) {
    blocks.push(`gate_5_main: variants.__all__ is missing`)
    return blocks
  }

  const main = variantAll.main as MediaRef | undefined
  if (!main || !main.id || !main.filename || !main.source_path) {
    blocks.push(
      `gate_5_main: variants.__all__.main missing required fields (id, filename, source_path) — found: ${JSON.stringify(main ?? null)}`
    )
  }

  // Gate 6: all gallery items have required fields
  const gallery = (variantAll.gallery ?? []) as MediaRef[]
  for (let i = 0; i < gallery.length; i++) {
    const item = gallery[i] as MediaRef
    if (!item.id || !item.filename || !item.source_path) {
      blocks.push(
        `gate_6_gallery: gallery[${i}] missing required fields (id, filename, source_path) — found: ${JSON.stringify(item)}`
      )
    }
  }

  // Gates 7 & 8 require valid main.id
  if (main?.id) {
    const allIds = [main.id, ...gallery.map((g) => g.id)]

    // Gate 7: no duplicate ids
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const id of allIds) {
      if (seen.has(id)) dupes.push(id)
      seen.add(id)
    }
    if (dupes.length > 0) {
      blocks.push(`gate_7_duplicate_ids: duplicate media ids: ${dupes.join(", ")}`)
    }

    // Gate 8: main.id not in gallery
    const galleryIds = new Set(gallery.map((g) => g.id))
    if (galleryIds.has(main.id)) {
      blocks.push(
        `gate_8_main_in_gallery: main.id "${main.id}" (${main.filename}) also found in gallery — role conflict`
      )
    }
  }

  // Gate 9: no absolute machine paths in any source_path
  const allRefs: MediaRef[] = []
  if (main?.source_path) allRefs.push(main)
  allRefs.push(...gallery.filter((g) => g.source_path))
  for (const ref of allRefs) {
    if (ref.source_path.includes("/Users/") || ref.source_path.includes("/WOODRIGHT")) {
      blocks.push(
        `gate_9_abs_path: source_path "${ref.source_path}" contains forbidden segment (/Users/ or /WOODRIGHT)`
      )
    }
  }

  // Gate 10: export handle matches assignments object key
  if (productAssignment.handle !== assignmentKey) {
    blocks.push(
      `gate_10_handle_match: assignments key "${assignmentKey}" !== assignment.handle "${productAssignment.handle}"`
    )
  }

  return blocks
}

// ── URL mapping ────────────────────────────────────────────────────────────

const STATIC_SOURCE_PREFIX = "apps/backend/"
const LOCALHOST_STATIC_BASE = "http://localhost:9000"

function sourcePathToUrl(sourcePath: string): { url: string | null; error: string | null } {
  if (!sourcePath.startsWith(STATIC_SOURCE_PREFIX)) {
    return {
      url: null,
      error: `source_path does not start with "${STATIC_SOURCE_PREFIX}" (got: "${sourcePath}")`,
    }
  }
  const rel = sourcePath.slice(STATIC_SOURCE_PREFIX.length)
  if (!rel.startsWith("static/")) {
    return {
      url: null,
      error: `resolved path "${rel}" does not start with "static/" — expected "static/products/..."`,
    }
  }
  return { url: `${LOCALHOST_STATIC_BASE}/${rel}`, error: null }
}

// ── HEAD check ─────────────────────────────────────────────────────────────

async function headCheckUrl(
  url: string
): Promise<{ status: number | null; ok: boolean; error: string | null }> {
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(url, { method: "HEAD", signal: controller.signal })
    clearTimeout(tid)
    return { status: resp.status, ok: resp.ok, error: null }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: null, ok: false, error: msg }
  }
}

// ── Build one media item plan ──────────────────────────────────────────────

async function buildMediaItemPlan(ref: MediaRef, warnings: string[]): Promise<MediaItemPlan> {
  const { url, error: urlError } = sourcePathToUrl(ref.source_path)

  if (urlError || !url) {
    warnings.push(`url_mapping: ${ref.filename} — ${urlError ?? "unknown mapping error"}`)
    return {
      id: ref.id,
      filename: ref.filename,
      url: null,
      url_error: urlError,
      url_status: null,
      url_ok: false,
    }
  }

  const check = await headCheckUrl(url)
  if (!check.ok) {
    const detail = check.error ? `fetch error: ${check.error}` : `HTTP ${String(check.status)}`
    warnings.push(`url_not_reachable: ${ref.filename} → ${url} (${detail})`)
  }

  return {
    id: ref.id,
    filename: ref.filename,
    url,
    url_error: check.error,
    url_status: check.status,
    url_ok: check.ok,
  }
}

// ── Main executor ──────────────────────────────────────────────────────────

export default async function applyLegacyV2boardMediaExports({ container }: ExecArgs) {
  const logger = container.resolve("logger") as {
    info: (s: string) => void
    warn: (s: string) => void
    error: (s: string) => void
  }

  // Apply path not implemented in Commit A — block explicitly
  if (process.argv.includes("--apply")) {
    logger.error(
      "Legacy v2board executor: --apply is not implemented in this version (Commit A — dry-run only). " +
        "The gated apply path will be added in Commit B after human review of the dry-run output."
    )
    process.exit(1)
  }

  // Require --export <path>
  const exportArg = getExportArg()
  if (!exportArg) {
    logger.error(
      "Usage: yarn legacy-v2board-media:dry-run -- --export <path>\n" +
        "  <path> is relative to repo root or absolute.\n" +
        "  Example: --export tmp/qa-screenshots/manual-triage-export-co-08-1-fixed.json\n" +
        "  No --apply flag: this executor is dry-run only (Commit A)."
    )
    process.exit(1)
  }

  const exportPath = resolveExportPath(exportArg)
  if (!fs.existsSync(exportPath)) {
    logger.error(
      `Export file not found: ${exportPath}\n` +
        `  Tried: ${path.resolve(process.cwd(), exportArg)}\n` +
        `  Tried: ${path.resolve(process.cwd(), "../../", exportArg)}`
    )
    process.exit(1)
  }

  logger.info(`[v2board dry-run] Reading export: ${exportPath}`)

  // Parse JSON
  let exportData: V2BoardExport
  try {
    exportData = JSON.parse(fs.readFileSync(exportPath, "utf-8")) as V2BoardExport
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error(`[v2board dry-run] Failed to parse export JSON: ${msg}`)
    process.exit(1)
  }

  // Run all 10 input validation gates — collect all blocks before exiting
  const validationBlocks = validateV2BoardExport(exportData)
  if (validationBlocks.length > 0) {
    logger.error("[v2board dry-run] Input validation BLOCKED:")
    for (const b of validationBlocks) {
      logger.error(`  BLOCK: ${b}`)
    }
    process.exit(1)
  }

  logger.info("[v2board dry-run] All 10 input validation gates passed.")

  // Extract the single product assignment
  const assignmentKey = Object.keys(exportData.assignments)[0] as string
  const productAssignment = exportData.assignments[assignmentKey] as ProductAssignment
  const handle = productAssignment.handle
  const variantAll = productAssignment.variants.__all__
  const mainRef = variantAll.main
  const galleryRefs = variantAll.gallery

  logger.info(`[v2board dry-run] Processing product: ${handle}`)

  // Resolve product by handle (read-only listProducts)
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<ProductRow[]>
  }

  const listed = await productModule.listProducts(
    { handle: [handle] },
    { take: 5, relations: ["images"] }
  )
  const products = listed ?? []

  const warnings: string[] = []
  const blockedReasons: string[] = []
  let productId = "NOT_FOUND"
  let currentThumbnail: string | null = null
  let currentImages: string[] = []

  if (products.length === 0) {
    warnings.push(`product_not_found: no product with handle "${handle}" in Medusa`)
    logger.warn(`[v2board dry-run] Product not found for handle: ${handle}`)
  } else if (products.length > 1) {
    blockedReasons.push(
      `product_ambiguous: handle "${handle}" matched ${products.length} products — manual disambiguation required in export`
    )
    logger.error(
      `[v2board dry-run] Ambiguous handle "${handle}": ${products.length} products found`
    )
  } else {
    const product = products[0] as ProductRow
    productId = product.id
    currentThumbnail = product.thumbnail ?? null
    currentImages = (product.images ?? [])
      .map((i) => i.url ?? null)
      .filter((u): u is string => u !== null)
    logger.info(`[v2board dry-run] Product resolved: ${handle} → ${productId}`)
  }

  // Build media item plan for main
  const plannedThumbnail = await buildMediaItemPlan(mainRef, warnings)

  // Deduplicate gallery (belt-and-suspenders after gate 8)
  const skippedDuplicates: string[] = []
  const seenGalleryIds = new Set<string>([mainRef.id])
  const deduplicatedGallery: MediaRef[] = []
  for (const item of galleryRefs) {
    if (seenGalleryIds.has(item.id)) {
      skippedDuplicates.push(item.id)
    } else {
      seenGalleryIds.add(item.id)
      deduplicatedGallery.push(item)
    }
  }

  const plannedGallery: MediaItemPlan[] = []
  for (const ref of deduplicatedGallery) {
    plannedGallery.push(await buildMediaItemPlan(ref, warnings))
  }

  const plan: DryRunProductPlan = {
    mode: "dry-run",
    export_path: exportPath,
    handle,
    product_id: productId,
    current_thumbnail: currentThumbnail,
    current_images: currentImages,
    planned_thumbnail: plannedThumbnail,
    planned_gallery: plannedGallery,
    skipped_duplicates: skippedDuplicates,
    warnings,
    blocked_reasons: blockedReasons,
  }

  // ── Human-readable summary ─────────────────────────────────────────────

  function urlStatusLabel(item: MediaItemPlan): string {
    if (item.url_ok) return "200 OK"
    if (!item.url) return "unmapped"
    if (item.url_error) return `ERR: ${item.url_error.slice(0, 80)}`
    return `HTTP ${String(item.url_status)}`
  }

  logger.info("")
  logger.info("══════════════════════════════════════════════════════════════")
  logger.info("  V2BOARD DRY-RUN PLAN")
  logger.info("══════════════════════════════════════════════════════════════")
  logger.info(`  Export:            ${exportPath}`)
  logger.info(`  Handle:            ${handle}`)
  logger.info(`  Product ID:        ${productId}`)
  logger.info(`  Current thumb:     ${currentThumbnail ?? "(none)"}`)
  logger.info(`  Current images:    ${currentImages.length} item(s)`)
  logger.info("")
  logger.info(`  Planned thumbnail: ${plannedThumbnail.filename}`)
  logger.info(`    URL:             ${plannedThumbnail.url ?? "(unmapped)"}`)
  logger.info(`    Status:          ${urlStatusLabel(plannedThumbnail)}`)
  logger.info("")
  logger.info(`  Planned gallery:   ${plannedGallery.length} item(s)`)
  for (let i = 0; i < plannedGallery.length; i++) {
    const g = plannedGallery[i] as MediaItemPlan
    logger.info(`    [${i}] ${g.filename}`)
    logger.info(`        URL:    ${g.url ?? "(unmapped)"}`)
    logger.info(`        Status: ${urlStatusLabel(g)}`)
  }
  if (skippedDuplicates.length > 0) {
    logger.info("")
    logger.info(`  Skipped duplicates: ${skippedDuplicates.join(", ")}`)
  }
  if (warnings.length > 0) {
    logger.info("")
    logger.info(`  Warnings (${warnings.length}):`)
    for (const w of warnings) {
      logger.info(`    WARN: ${w}`)
    }
  }
  if (blockedReasons.length > 0) {
    logger.info("")
    logger.info(`  Blocked (${blockedReasons.length}):`)
    for (const b of blockedReasons) {
      logger.info(`    BLOCK: ${b}`)
    }
  }
  logger.info("══════════════════════════════════════════════════════════════")
  logger.info("")

  // ── JSON plan ─────────────────────────────────────────────────────────

  logger.info("[v2board dry-run] JSON plan:")
  logger.info(JSON.stringify(plan, null, 2))

  if (blockedReasons.length > 0) {
    logger.error(
      `[v2board dry-run] BLOCKED: ${blockedReasons.length} reason(s). See blocked_reasons in plan above.`
    )
    process.exit(1)
  }

  logger.info(
    `[v2board dry-run] Done. No writes to Medusa. Warnings: ${warnings.length}. ` +
      `To apply: implement Commit B with --apply + LEGACY_V2BOARD_APPLY_CONFIRM=1 after human review.`
  )
}
