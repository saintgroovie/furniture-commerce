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
import {
  buildBuyerGallery,
  pickBuyerThumbnail,
  sortUrlsByBuyerPolicy,
  toMedusaImages,
} from "../lib/gallery-buyer-sort"

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
    const front34 = handleRows.find((r) => r.operator_role === "front_3_4")
    const front = handleRows.find((r) => r.operator_role === "front")
    const thumbRow = front34 ?? front ?? handleRows[0]
    const roleByUrl = new Map<string, string>()
    for (const row of handleRows) {
      roleByUrl.set(absUrl(base, row.public_url), row.operator_role)
    }
    const galleryUrls = sortUrlsByBuyerPolicy(
      normalizeUrls(handleRows.map((r) => absUrl(base, r.public_url))),
      { handle, roleByUrl }
    )
    const thumbnailUrl = pickBuyerThumbnail(galleryUrls, handle) || absUrl(base, thumbRow.public_url)
    const galleryOrdered = buildBuyerGallery(
      galleryUrls.filter((u) => u !== thumbnailUrl),
      [],
      { handle, roleByUrl }
    )
    const galleryFinal = [thumbnailUrl, ...galleryOrdered.filter((u) => u !== thumbnailUrl)]
    plans.push({
      handle,
      thumbnail_url: thumbnailUrl,
      gallery_urls: galleryFinal,
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
  const confirmApply = process.env.WW_FLOW_A_MEDIA_CONFIRM === "1"
  const root = repoRoot()
  const outDir = path.join(root, OUT_DIR)
  fs.mkdirSync(outDir, { recursive: true })

  // ---- Phase 1: load inputs ----
  const whitelistFile = loadJson<WhitelistFile>(root, WHITELIST_PATH)
  const mediaFile = loadJson<{ count: number; rows: MediaRow[] }>(root, MEDIA_SOURCE)
  const whitelist = new Set(whitelistFile.handles.map((h) => h.toLowerCase()))

  // ---- Phase 2: build/validate scope ----
  if (whitelist.size !== 28) throw new Error(`Whitelist must have 28 handles, got ${whitelist.size}`)
  for (const ex of EXCLUDED) {
    if (whitelist.has(ex)) throw new Error(`Excluded handle in whitelist: ${ex}`)
  }

  const base = backendBaseUrl(root)
  const plans = buildHandlePlans(mediaFile.rows, whitelist, base)
  if (plans.length !== 28) throw new Error(`Expected 28 handle plans, got ${plans.length}`)

  // ---- Phase 3: load products (read-only) ----
  const productModule = container.resolve(Modules.PRODUCT)
  const handles = plans.map((p) => p.handle)
  const listed = await productModule.listProducts(
    { handle: handles },
    { take: 40, relations: ["images", "variants"] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle.toLowerCase(), p]))

  // ---- Phase 4: collect ALL blockers + build preview (NO mutation) ----
  const blockers: string[] = []
  const skipAttempts: Record<string, unknown>[] = []
  const pending: {
    plan: HandlePlan
    productId: string
    beforeThumb: string | null
    beforeImageCount: number
  }[] = []

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
      skipAttempts.push({
        handle: plan.handle,
        product_id: product.id,
        outcome: "skip_already_applied",
        thumbnail_url: plan.thumbnail_url,
        image_count: plan.gallery_urls.length,
      })
      continue
    }

    pending.push({
      plan,
      productId: product.id,
      beforeThumb,
      beforeImageCount: beforeUrls.length,
    })
  }

  // Oxford spot-check (read-only) — collected BEFORE the gate so it can block mutation
  const oxListed = await productModule.listProducts(
    { handle: OXFORD_HANDLES },
    { take: 10, relations: ["images"] }
  )
  for (const ox of oxListed ?? []) {
    if (ox.status !== "published") blockers.push(`oxford_status_changed:${ox.handle}`)
  }

  // ---- Phase 5: mutation gate ----
  const hasBlockers = blockers.length > 0
  const mutationAllowed = !hasBlockers && !dryRun && confirmApply

  // ---- Phase 6: mutation phase — ONLY when the gate is fully open ----
  const updatedAttempts: Record<string, unknown>[] = []
  let mutationAttempted = false
  if (mutationAllowed) {
    for (const item of pending) {
      // mutation_attempted flips true only when an actual update is issued
      mutationAttempted = true
      await productModule.updateProducts(item.productId, {
        thumbnail: item.plan.thumbnail_url,
        images: toMedusaImages(item.plan.gallery_urls, item.plan.handle),
      })
      updatedAttempts.push({
        handle: item.plan.handle,
        product_id: item.productId,
        outcome: "updated",
        thumbnail_url: item.plan.thumbnail_url,
        image_count: item.plan.gallery_urls.length,
        before_thumbnail: item.beforeThumb,
        before_image_count: item.beforeImageCount,
      })
      logger.info(`Updated media for ${item.plan.handle} (${item.plan.gallery_urls.length} images)`)
    }
  }

  const previewAttempts = mutationAttempted
    ? updatedAttempts
    : pending.map((item) => ({
        handle: item.plan.handle,
        product_id: item.productId,
        outcome: dryRun ? "dry_run_would_update" : "would_update_pending_confirm",
        thumbnail_url: item.plan.thumbnail_url,
        thumbnail_role: item.plan.thumbnail_role,
        image_count: item.plan.gallery_urls.length,
        gallery_urls: item.plan.gallery_urls,
        media_rows: item.plan.rows.length,
      }))
  const attempts = [...skipAttempts, ...previewAttempts]

  const gateVerdict = hasBlockers
    ? "blocked"
    : dryRun
      ? "dry_run"
      : !confirmApply
        ? "requires_confirm"
        : updatedAttempts.length > 0
          ? "applied"
          : "noop"

  const legacyVerdict = hasBlockers
    ? "blocked_before_media_apply"
    : dryRun
      ? "media_dry_run_ready_apply_not_run"
      : !confirmApply
        ? "requires_confirm_apply_not_run"
        : updatedAttempts.length > 0
          ? "media_applied"
          : "media_apply_noop"

  const mode = hasBlockers
    ? "blocked"
    : dryRun
      ? "dry_run"
      : !confirmApply
        ? "requires_confirm"
        : "apply"

  const report = {
    generated_at: new Date().toISOString(),
    mode,
    gate_verdict: gateVerdict,
    verdict: legacyVerdict,
    dry_run: dryRun,
    confirm_present: confirmApply,
    blockers_count: blockers.length,
    mutation_allowed: mutationAllowed,
    mutation_attempted: mutationAttempted,
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
      would_update: attempts.filter((a) => String(a.outcome).includes("would_update")).length,
      updated: attempts.filter((a) => a.outcome === "updated").length,
      skipped: attempts.filter((a) => String(a.outcome).includes("skip")).length,
      errors: blockers.length,
    },
  }

  const fileName =
    mode === "apply"
      ? "media-apply-result.json"
      : mode === "dry_run"
        ? "media-apply-dry-run-result.json"
        : mode === "blocked"
          ? "media-apply-blocked-result.json"
          : "media-apply-requires-confirm-result.json"
  const outPath = path.join(outDir, fileName)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
  logger.info(`Wrote ${outPath}`)
  logger.info(`Verdict: ${report.gate_verdict} (legacy: ${report.verdict})`)

  if (hasBlockers) {
    for (const b of blockers) logger.info(`  blocker: ${b}`)
    throw new Error(`Media apply blocked (${blockers.length} blocker(s)) — no mutation performed`)
  }

  if (dryRun) {
    logger.info("Dry-run complete. No mutation performed.")
    return
  }

  if (!confirmApply) {
    logger.info("Requires confirm. Set WW_FLOW_A_MEDIA_CONFIRM=1 to apply. No mutation performed.")
    return
  }
}
