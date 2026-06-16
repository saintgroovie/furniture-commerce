/**
 * Willie Winkie Flow A — whitelist product-media apply (28 handles only).
 *
 * Dry-run:
 *   WW_FLOW_A_MEDIA_DRY_RUN=1 WW_FLOW_A_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-willie-winkie-flow-a-product-media.ts
 *
 * Apply:
 *   WW_FLOW_A_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-willie-winkie-flow-a-product-media.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const EXCLUDED = new Set(["co-02-1", "am-02-1"])
const MEDIA_SOURCE = "tmp/flow-a-product-media-assignment-preflight-2026-06-12-1232/flow-a-media-rows.json"
const WHITELIST_PATH = "tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json"
const OUT_DIR = "tmp/flow-a-product-media-apply-gate"
const OXFORD_HANDLES = ["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"]

type MediaRow = {
  inventory_id: string
  filename: string
  handle_hint: string
  top_candidate_handle: string
  operator_role: string
  repo_relative_path: string
  public_url: string
  exists_on_this_host?: boolean
  previewable?: boolean
}

type WhitelistFile = { handles: string[] }

type HandlePlan = {
  handle: string
  thumbnail_url: string
  gallery_urls: string[]
  rows: MediaRow[]
  thumbnail_role: string
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function loadJson<T>(root: string, rel: string): T {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) throw new Error(`Missing ${rel}`)
  return JSON.parse(fs.readFileSync(p, "utf8")) as T
}

function backendBaseUrl(root: string): string {
  const envPath = path.join(root, "apps/backend/.env")
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8")
    const m = env.match(/^MEDUSA_BACKEND_URL=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "")
  }
  return "http://localhost:9000"
}

function absUrl(base: string, publicUrl: string): string {
  const p = publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}`
  return `${base}${p}`
}

function normalizeUrls(urls: string[]): string[] {
  return [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
}

function buildHandlePlans(rows: MediaRow[], whitelist: Set<string>, base: string): HandlePlan[] {
  const byHandle = new Map<string, MediaRow[]>()
  for (const row of rows) {
    const handle = (row.top_candidate_handle || row.handle_hint || "").toLowerCase()
    if (!handle || EXCLUDED.has(handle) || !whitelist.has(handle)) continue
    if (!byHandle.has(handle)) byHandle.set(handle, [])
    byHandle.get(handle)!.push(row)
  }

  const plans: HandlePlan[] = []
  for (const handle of [...whitelist].sort()) {
    const handleRows = byHandle.get(handle) ?? []
    if (handleRows.length === 0) {
      throw new Error(`No approved media rows for whitelist handle: ${handle}`)
    }
    for (const row of handleRows) {
      const disk = path.join(repoRoot(), row.repo_relative_path)
      if (!fs.existsSync(disk)) {
        throw new Error(`Missing static file: ${row.repo_relative_path} (${handle})`)
      }
    }
    const front = handleRows.find((r) => r.operator_role === "front")
    const front34 = handleRows.find((r) => r.operator_role === "front_3_4")
    const thumbRow = front ?? front34 ?? handleRows[0]
    const galleryUrls = normalizeUrls(
      handleRows.map((r) => absUrl(base, r.public_url))
    )
    const thumbnailUrl = absUrl(base, thumbRow.public_url)
    const galleryOrdered = [thumbnailUrl, ...galleryUrls.filter((u) => u !== thumbnailUrl)]
    plans.push({
      handle,
      thumbnail_url: thumbnailUrl,
      gallery_urls: galleryOrdered,
      rows: handleRows,
      thumbnail_role: thumbRow.operator_role,
    })
  }
  return plans
}

function imagesMatch(
  beforeThumb: string | null | undefined,
  beforeImages: string[],
  plan: HandlePlan
): boolean {
  const beforeSet = new Set(beforeImages.map((u) => u.trim()))
  const afterSet = new Set(plan.gallery_urls)
  if ((beforeThumb ?? "").trim() !== plan.thumbnail_url) return false
  if (beforeSet.size !== afterSet.size) return false
  for (const u of afterSet) if (!beforeSet.has(u)) return false
  return true
}

export default async function applyWillieWinkieFlowAProductMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.WW_FLOW_A_MEDIA_DRY_RUN === "1"
  const root = repoRoot()
  const outDir = path.join(root, OUT_DIR)
  fs.mkdirSync(outDir, { recursive: true })

  if (process.env.WW_FLOW_A_MEDIA_CONFIRM !== "1") {
    logger.info("Skipped. Set WW_FLOW_A_MEDIA_CONFIRM=1 (use WW_FLOW_A_MEDIA_DRY_RUN=1 for dry-run).")
    return
  }

  const whitelistFile = loadJson<WhitelistFile>(root, WHITELIST_PATH)
  const mediaFile = loadJson<{ count: number; rows: MediaRow[] }>(root, MEDIA_SOURCE)
  const whitelist = new Set(whitelistFile.handles.map((h) => h.toLowerCase()))

  if (whitelist.size !== 28) throw new Error(`Whitelist must have 28 handles, got ${whitelist.size}`)
  for (const ex of EXCLUDED) {
    if (whitelist.has(ex)) throw new Error(`Excluded handle in whitelist: ${ex}`)
  }

  const base = backendBaseUrl(root)
  const plans = buildHandlePlans(mediaFile.rows, whitelist, base)
  if (plans.length !== 28) throw new Error(`Expected 28 handle plans, got ${plans.length}`)

  const productModule = container.resolve(Modules.PRODUCT)
  const handles = plans.map((p) => p.handle)
  const listed = await productModule.listProducts(
    { handle: handles },
    { take: 40, relations: ["images", "variants"] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle.toLowerCase(), p]))

  const attempts: Record<string, unknown>[] = []
  const blockers: string[] = []

  for (const plan of plans) {
    const product = byHandle.get(plan.handle)
    if (!product?.id) {
      blockers.push(`missing_product:${plan.handle}`)
      continue
    }
    if (product.status !== "draft") {
      blockers.push(`not_draft:${plan.handle}:${product.status}`)
    }
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    if (meta.launch_mode !== "request_quote") blockers.push(`launch_mode:${plan.handle}`)
    if (meta.cart_group !== "Woodright Kids") blockers.push(`cart_group:${plan.handle}`)
    if (meta.collection !== "willie-winkie") blockers.push(`collection:${plan.handle}`)

    const beforeThumb = product.thumbnail ?? null
    const beforeUrls = (product.images ?? []).map((i) => i?.url).filter(Boolean) as string[]

    if (imagesMatch(beforeThumb, beforeUrls, plan)) {
      attempts.push({
        handle: plan.handle,
        product_id: product.id,
        outcome: dryRun ? "dry_run_skip_already_applied" : "skip_already_applied",
        thumbnail_url: plan.thumbnail_url,
        image_count: plan.gallery_urls.length,
      })
      continue
    }

    if (dryRun) {
      attempts.push({
        handle: plan.handle,
        product_id: product.id,
        outcome: "dry_run_would_update",
        thumbnail_url: plan.thumbnail_url,
        thumbnail_role: plan.thumbnail_role,
        image_count: plan.gallery_urls.length,
        gallery_urls: plan.gallery_urls,
        media_rows: plan.rows.length,
      })
      continue
    }

    await productModule.updateProducts(product.id, {
      thumbnail: plan.thumbnail_url,
      images: plan.gallery_urls.map((url) => ({ url })),
    })
    attempts.push({
      handle: plan.handle,
      product_id: product.id,
      outcome: "updated",
      thumbnail_url: plan.thumbnail_url,
      image_count: plan.gallery_urls.length,
      before_thumbnail: beforeThumb,
      before_image_count: beforeUrls.length,
    })
    logger.info(`Updated media for ${plan.handle} (${plan.gallery_urls.length} images)`)
  }

  // Oxford spot-check (read-only)
  const oxListed = await productModule.listProducts(
    { handle: OXFORD_HANDLES },
    { take: 10, relations: ["images"] }
  )
  for (const ox of oxListed ?? []) {
    if (ox.status !== "published") blockers.push(`oxford_status_changed:${ox.handle}`)
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry_run" : "apply",
    media_source: MEDIA_SOURCE,
    whitelist_path: WHITELIST_PATH,
    media_row_count: mediaFile.rows.filter((r) =>
      whitelist.has((r.top_candidate_handle || r.handle_hint || "").toLowerCase())
    ).length,
    handle_count: plans.length,
    backend_base_url: base,
    blockers,
    attempts,
    summary: {
      would_update: attempts.filter((a) => a.outcome === "dry_run_would_update").length,
      updated: attempts.filter((a) => a.outcome === "updated").length,
      skipped: attempts.filter((a) => String(a.outcome).includes("skip")).length,
      errors: blockers.length,
    },
    verdict:
      blockers.length > 0
        ? "blocked_before_media_apply"
        : dryRun
          ? "media_dry_run_ready_apply_not_run"
          : attempts.some((a) => a.outcome === "updated")
            ? "media_applied"
            : "media_apply_noop",
  }

  const outPath = path.join(outDir, dryRun ? "media-apply-dry-run-result.json" : "media-apply-result.json")
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
  logger.info(`Wrote ${outPath}`)
  logger.info(`Verdict: ${report.verdict}`)

  if (blockers.length > 0) {
    for (const b of blockers) logger.info(`  blocker: ${b}`)
    throw new Error(`Media apply blocked (${blockers.length} blocker(s))`)
  }
}
