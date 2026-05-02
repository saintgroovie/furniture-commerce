/**
 * Controlled MVP media assignment executor (dry-run by default).
 *
 * Reads: `data/normalized/storefront-mvp-media-assignment-dry-run.json`
 * Writes: `data/normalized/storefront-mvp-media-assignment-executor-dry-run.json`
 *
 * Default: dry-run only — classifies rows, checks source path/URL contract, no DB writes.
 * `--apply`: updates product `thumbnail` and `images` only (no metadata, no new products),
 *   for rows that pass executor gates **and** `apply_allowed_in_future` (source exists or valid http URL).
 *   Requires `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1` (second gate).
 *   Temporary non-white **local static** rows (see below) additionally require
 *   `MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1` or they are skipped on apply.
 *
 * Eligible class A — white-background (v1 apply subset when `--apply`):
 * - `dry_run_verdict === "eligible_for_future_apply"`
 * - `identity_confidence === "confirmed"`
 * - `selected_primary_image_type === "white_background"`
 * - `collection_key !== "oxford"`
 * - `collection_status` must not imply paused pilot or stage_0_excluded (substring guards)
 *
 * Eligible class B — temporary non-white **local static** (dry-run + gated apply):
 * - `dry_run_verdict === "eligible_temporary_local_visual_ready"`
 * - `identity_confidence === "confirmed"`
 * - `selected_primary_image_type === "backend_static_existing"`
 * - `proposed_assignment_type === "temporary_primary_image"`
 * - `needs_later_white_background_replacement === true` (boolean in dry-run JSON)
 * - Path must be a **local filesystem** file that exists (not http(s) alone — confirmed_local_static_only)
 * - `collection_key !== "oxford"`
 * - `collection_status` not blocked (same substring guards as class A)
 *
 * Run from apps/backend:
 *   yarn mvp-media-assignments
 *   MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply
 *
 * Optional: MVP_MEDIA_DRY_RUN_INPUT, MVP_MEDIA_EXECUTOR_OUTPUT (absolute or cwd-relative paths)
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const DRY_RUN_INPUT_DEFAULT =
  "data/normalized/storefront-mvp-media-assignment-dry-run.json"
const EXECUTOR_OUTPUT_DEFAULT =
  "data/normalized/storefront-mvp-media-assignment-executor-dry-run.json"

const ELIGIBILITY_WHITE_BG = "white_background_v1" as const
const ELIGIBILITY_TEMP_STATIC = "temporary_non_white_static_local" as const

type DryRunAssignment = {
  id?: string
  product_sku_or_handle?: string
  collection_key?: string
  collection_status?: string
  selected_primary_image_path_or_ref?: string
  selected_primary_image_type?: string
  identity_confidence?: string
  proposed_assignment_type?: string
  dry_run_verdict?: string
  reason?: string
  needs_later_white_background_replacement?: boolean
}

type SourceSkipped = {
  product_sku_or_handle?: string
  collection_key?: string
  skip_reason?: string
  blocker_type?: string
}

type DryRunFile = {
  audit_meta?: Record<string, unknown>
  source_files_checked?: string[]
  dry_run_assignments?: DryRunAssignment[]
  skipped?: SourceSkipped[]
}

type TemporaryNonWhitePolicy = {
  temporary_non_white_static_allowed: true
  temporary_non_white_static_scope: "confirmed_local_static_only"
  production_media_claim: false
  requires_later_white_background_replacement: true
}

type EligibleRow = {
  product_sku_or_handle: string
  collection_key: string
  proposed_image: string
  proposed_assignment_type: string
  current_action: "would_assign_primary_image"
  apply_allowed_in_future: boolean
  reason: string
  eligibility_class: typeof ELIGIBILITY_WHITE_BG | typeof ELIGIBILITY_TEMP_STATIC
  executor_policy?: TemporaryNonWhitePolicy
}

type SkippedRow = {
  product_sku_or_handle: string
  collection_key: string
  skip_reason: string
  guardrail: string
}

type ProductImage = { url?: string | null } | null | undefined

type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: ProductImage[]
  variants?: Array<{ sku?: string | null }>
}

type ApplyAttemptRow = {
  product_sku_or_handle: string
  collection_key: string
  outcome: "updated" | "unchanged" | "error"
  detail: string
  medusa_product_id?: string
  medusa_handle?: string
  target_url?: string
}

type FileModuleLike = {
  createFiles: (
    data: Array<{
      filename: string
      mimeType: string
      content: string
      access?: "public" | "private"
    }>
  ) => Promise<Array<{ id: string; url: string }>>
}

function wantsApply(): boolean {
  return process.argv.includes("--apply")
}

function applyConfirmOk(): boolean {
  return process.env.MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM === "1"
}

function allowTemporaryStaticApply(): boolean {
  return process.env.MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC === "1"
}

function resolveRepoDataPath(envKey: string, defaultRelative: string): string {
  const env = process.env[envKey]
  const candidates = [
    env && path.isAbsolute(env) ? env : null,
    env ? path.join(process.cwd(), env) : null,
    path.join(process.cwd(), defaultRelative),
    path.resolve(process.cwd(), "../../", defaultRelative),
  ].filter((p): p is string => Boolean(p))

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c
    }
  }
  return candidates[candidates.length - 1]!
}

function resolveOutputPath(envKey: string, defaultRelative: string): string {
  const env = process.env[envKey]
  if (env && path.isAbsolute(env)) {
    return env
  }
  if (env) {
    return path.join(process.cwd(), env)
  }
  return path.resolve(process.cwd(), "../../", defaultRelative)
}

function collectionStatusBlocked(status: string): boolean {
  const s = status.toLowerCase()
  return (
    s.includes("paused_stage") ||
    s.includes("stage_0_excluded") ||
    s.includes("blocked_by_painting") ||
    s.includes("selective_backfill_track")
  )
}

function isStaticHttpUrl(ref: string): boolean {
  try {
    const u = new URL(ref.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function preApplySourceCheck(ref: string): { ok: boolean; detail: string } {
  const trimmed = ref.trim()
  if (!trimmed) {
    return { ok: false, detail: "empty_ref" }
  }
  if (isStaticHttpUrl(trimmed)) {
    return { ok: true, detail: "http_url_contract_ok" }
  }
  if (fs.existsSync(trimmed)) {
    return { ok: true, detail: "local_path_exists" }
  }
  return { ok: false, detail: "local_path_missing" }
}

/** Class A: white-background apply-ready (historical v1 subset). */
function passesWhiteBackgroundApplyGates(
  row: DryRunAssignment
): { ok: true } | { ok: false; reason: string; guardrail: string } {
  if (row.dry_run_verdict !== "eligible_for_future_apply") {
    return {
      ok: false,
      reason: `dry_run_verdict=${String(row.dry_run_verdict)}`,
      guardrail: "executor_only_eligible_for_future_apply",
    }
  }
  if (row.identity_confidence !== "confirmed") {
    return {
      ok: false,
      reason: `identity_confidence=${String(row.identity_confidence)}`,
      guardrail: "identity_must_be_confirmed",
    }
  }
  if (row.selected_primary_image_type !== "white_background") {
    return {
      ok: false,
      reason: `selected_primary_image_type=${String(row.selected_primary_image_type)}`,
      guardrail: "v1_executor_whitelist_white_background_only",
    }
  }
  const ck = String(row.collection_key ?? "")
  if (ck === "oxford") {
    return {
      ok: false,
      reason: "Oxford collection never in v1 MVP apply subset",
      guardrail: "no_oxford_four_no_paused_scope",
    }
  }
  const cs = String(row.collection_status ?? "")
  if (collectionStatusBlocked(cs)) {
    return {
      ok: false,
      reason: `collection_status=${cs}`,
      guardrail: "collection_status_paused_or_excluded",
    }
  }
  return { ok: true }
}

/** Class B: confirmed local static non-white temporary primary (dry-run eligible; apply gated). */
function passesTemporaryLocalStaticGates(
  row: DryRunAssignment
): { ok: true } | { ok: false; reason: string; guardrail: string } {
  if (row.dry_run_verdict !== "eligible_temporary_local_visual_ready") {
    return {
      ok: false,
      reason: `dry_run_verdict=${String(row.dry_run_verdict)}`,
      guardrail: "executor_only_eligible_temporary_local_visual_verdict",
    }
  }
  if (row.identity_confidence !== "confirmed") {
    return {
      ok: false,
      reason: `identity_confidence=${String(row.identity_confidence)}`,
      guardrail: "identity_must_be_confirmed",
    }
  }
  if (row.selected_primary_image_type !== "backend_static_existing") {
    return {
      ok: false,
      reason: `selected_primary_image_type=${String(row.selected_primary_image_type)}`,
      guardrail: "temporary_local_requires_backend_static_existing",
    }
  }
  const pat = String(row.proposed_assignment_type ?? "").trim()
  if (pat !== "temporary_primary_image") {
    return {
      ok: false,
      reason: `proposed_assignment_type=${pat}`,
      guardrail: "temporary_local_requires_temporary_primary_image",
    }
  }
  if (row.needs_later_white_background_replacement !== true) {
    return {
      ok: false,
      reason: `needs_later_white_background_replacement=${String(row.needs_later_white_background_replacement)}`,
      guardrail: "temporary_local_requires_later_white_background_flag",
    }
  }
  const ck = String(row.collection_key ?? "")
  if (ck === "oxford") {
    return {
      ok: false,
      reason: "Oxford excluded from temporary local static class",
      guardrail: "no_oxford_temporary_static_lane",
    }
  }
  const cs = String(row.collection_status ?? "")
  if (collectionStatusBlocked(cs)) {
    return {
      ok: false,
      reason: `collection_status=${cs}`,
      guardrail: "collection_status_paused_or_excluded",
    }
  }
  const ref = String(row.selected_primary_image_path_or_ref ?? "").trim()
  if (isStaticHttpUrl(ref)) {
    return {
      ok: false,
      reason: "temporary_non_white_static_scope_requires_local_path_not_http_url_alone",
      guardrail: "confirmed_local_static_only",
    }
  }
  return { ok: true }
}

function classifyAssignmentRow(
  row: DryRunAssignment
):
  | { kind: "eligible"; eligibilityClass: typeof ELIGIBILITY_TEMP_STATIC; preCheck: ReturnType<typeof preApplySourceCheck> }
  | { kind: "eligible"; eligibilityClass: typeof ELIGIBILITY_WHITE_BG; preCheck: ReturnType<typeof preApplySourceCheck> }
  | { kind: "skip"; reason: string; guardrail: string } {
  const verdict = String(row.dry_run_verdict ?? "")

  if (verdict === "eligible_temporary_local_visual_ready") {
    const g = passesTemporaryLocalStaticGates(row)
    if (!g.ok) {
      return { kind: "skip", reason: g.reason, guardrail: g.guardrail }
    }
    const ref = String(row.selected_primary_image_path_or_ref ?? "")
    const preCheck = preApplySourceCheck(ref)
    return { kind: "eligible", eligibilityClass: ELIGIBILITY_TEMP_STATIC, preCheck }
  }

  if (verdict === "eligible_for_future_apply") {
    const g = passesWhiteBackgroundApplyGates(row)
    if (!g.ok) {
      return { kind: "skip", reason: g.reason, guardrail: g.guardrail }
    }
    const ref = String(row.selected_primary_image_path_or_ref ?? "")
    const preCheck = preApplySourceCheck(ref)
    return { kind: "eligible", eligibilityClass: ELIGIBILITY_WHITE_BG, preCheck }
  }

  if (verdict === "eligible_but_paused_scope") {
    return {
      kind: "skip",
      reason: `dry_run_verdict=${verdict}`,
      guardrail: "eligible_but_paused_scope_not_in_executor_apply_subset",
    }
  }

  return {
    kind: "skip",
    reason: `dry_run_verdict=${verdict || "missing"}`,
    guardrail: "executor_no_matching_eligible_class",
  }
}

function loadDryRunJson(inputPath: string): DryRunFile {
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as DryRunFile
  if (!Array.isArray(raw.dry_run_assignments)) {
    throw new Error(`Invalid dry-run file: missing dry_run_assignments[] in ${inputPath}`)
  }
  return raw
}

/** Split "A / B" dry-run labels into lookup tokens (SKU/handle). */
function expandSkuOrHandleTokens(raw: string): string[] {
  const parts = raw
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out = new Set<string>()
  for (const p of parts) {
    out.add(p)
    out.add(p.toLowerCase())
    out.add(p.toUpperCase())
  }
  return [...out]
}

function normalizeUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null
  const t = u.trim()
  return t.length ? t : null
}

function extractImageUrls(images: ProductImage[] | undefined): string[] {
  const urls: string[] = []
  for (const im of images ?? []) {
    const u = normalizeUrl(im?.url as string | undefined)
    if (u && !urls.includes(u)) urls.push(u)
  }
  return urls
}

function buildSyncedImages(thumbnail: string, existingUrls: string[]): { url: string }[] {
  const thumb = normalizeUrl(thumbnail)
  if (!thumb) return existingUrls.map((u) => ({ url: u }))
  const rest = existingUrls.filter((u) => u !== thumb)
  return [thumb, ...rest].map((url) => ({ url }))
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  return "application/octet-stream"
}

function classifyDryRun(dry: DryRunFile): {
  eligibleRows: EligibleRow[]
  skippedRows: SkippedRow[]
  assignmentsScanned: number
  sourceSkippedMirrored: number
} {
  const assignments = dry.dry_run_assignments ?? []
  const sourceSkipped = dry.skipped ?? []
  const eligibleRows: EligibleRow[] = []
  const skippedRows: SkippedRow[] = []

  for (const row of assignments) {
    const sku = String(row.product_sku_or_handle ?? "unknown")
    const ck = String(row.collection_key ?? "unknown")
    const outcome = classifyAssignmentRow(row)
    if (outcome.kind === "eligible") {
      const pat = String(row.proposed_assignment_type ?? "primary_image")
      const policy: TemporaryNonWhitePolicy | undefined =
        outcome.eligibilityClass === ELIGIBILITY_TEMP_STATIC
          ? {
              temporary_non_white_static_allowed: true,
              temporary_non_white_static_scope: "confirmed_local_static_only",
              production_media_claim: false,
              requires_later_white_background_replacement: true,
            }
          : undefined
      eligibleRows.push({
        product_sku_or_handle: sku,
        collection_key: ck,
        proposed_image: String(row.selected_primary_image_path_or_ref ?? ""),
        proposed_assignment_type: pat,
        current_action: "would_assign_primary_image",
        apply_allowed_in_future: outcome.preCheck.ok,
        reason: `Class=${outcome.eligibilityClass}; logical gates OK; pre_apply_source=${outcome.preCheck.detail}`,
        eligibility_class: outcome.eligibilityClass,
        executor_policy: policy,
      })
    } else {
      skippedRows.push({
        product_sku_or_handle: sku,
        collection_key: ck,
        skip_reason: outcome.reason,
        guardrail: outcome.guardrail,
      })
    }
  }

  for (const s of sourceSkipped) {
    skippedRows.push({
      product_sku_or_handle: String(s.product_sku_or_handle ?? "unknown"),
      collection_key: String(s.collection_key ?? "unknown"),
      skip_reason: String(s.skip_reason ?? ""),
      guardrail: String(s.blocker_type ?? "source_dry_run_skipped_row"),
    })
  }

  return {
    eligibleRows,
    skippedRows,
    assignmentsScanned: assignments.length,
    sourceSkippedMirrored: sourceSkipped.length,
  }
}

function isTemporaryNonWhiteEligibleRow(row: EligibleRow): boolean {
  return row.eligibility_class === ELIGIBILITY_TEMP_STATIC
}

async function resolveTargetUrlForApply(
  proposedImage: string,
  fileModule: FileModuleLike | null,
  logger: { info: (s: string) => void; warn: (s: string) => void }
): Promise<{ ok: true; url: string } | { ok: false; detail: string }> {
  const ref = proposedImage.trim()
  if (isStaticHttpUrl(ref)) {
    return { ok: true, url: ref }
  }
  if (!fs.existsSync(ref)) {
    return { ok: false, detail: "local_path_missing" }
  }
  if (!fileModule) {
    return { ok: false, detail: "file_module_required_for_local_paths" }
  }
  const abs = path.resolve(ref)
  const filename = path.basename(abs)
  const mimeType = mimeFromFilename(filename)
  const content = fs.readFileSync(abs).toString("base64")
  try {
    const created = await fileModule.createFiles([
      { filename, mimeType, content, access: "public" },
    ])
    const first = created[0]
    if (!first?.url) {
      return { ok: false, detail: "file_upload_missing_url" }
    }
    logger.info(`Uploaded local file via FILE module: ${filename} -> ${first.url}`)
    return { ok: true, url: first.url }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn(`FILE createFiles failed: ${msg}`)
    return { ok: false, detail: `file_upload_error:${msg}` }
  }
}

function indexProducts(products: ProductRow[]): {
  bySku: Map<string, ProductRow>
  byHandle: Map<string, ProductRow>
} {
  const bySku = new Map<string, ProductRow>()
  const byHandle = new Map<string, ProductRow>()
  for (const p of products) {
    byHandle.set(p.handle.toLowerCase(), p)
    for (const v of p.variants ?? []) {
      const sku = v.sku?.trim()
      if (sku) {
        bySku.set(sku, p)
        bySku.set(sku.toLowerCase(), p)
        bySku.set(sku.toUpperCase(), p)
      }
    }
  }
  return { bySku, byHandle }
}

function findProductForRow(row: EligibleRow, idx: ReturnType<typeof indexProducts>): ProductRow | null {
  const tokens = expandSkuOrHandleTokens(row.product_sku_or_handle)
  for (const t of tokens) {
    const bySkuHit = idx.bySku.get(t)
    if (bySkuHit) return bySkuHit
    const byHandleHit = idx.byHandle.get(t.toLowerCase())
    if (byHandleHit) return byHandleHit
  }
  return null
}

export default async function applyMvpMediaAssignments({ container }: ExecArgs) {
  const logger = container.resolve("logger") as {
    info: (s: string) => void
    error: (s: string) => void
    warn: (s: string) => void
  }

  const apply = wantsApply()
  if (apply && !applyConfirmOk()) {
    logger.error(
      "Refusing --apply: set MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 (with yarn: MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1 yarn mvp-media-assignments -- --apply)."
    )
    process.exit(1)
  }

  const inputPath = resolveRepoDataPath("MVP_MEDIA_DRY_RUN_INPUT", DRY_RUN_INPUT_DEFAULT)
  if (!fs.existsSync(inputPath)) {
    logger.error(`Dry-run input not found: ${inputPath}`)
    process.exit(1)
  }

  const dry = loadDryRunJson(inputPath)
  const { eligibleRows, skippedRows, assignmentsScanned, sourceSkippedMirrored } = classifyDryRun(dry)

  for (const row of dry.dry_run_assignments ?? []) {
    const sku = String(row.product_sku_or_handle ?? "unknown")
    const outcome = classifyAssignmentRow(row)
    if (outcome.kind === "eligible") {
      logger.info(
        `ELIGIBLE${apply ? " (apply mode)" : ""}: ${sku} [${String(row.collection_key ?? "")}] class=${outcome.eligibilityClass} pre_apply=${outcome.preCheck.detail}`
      )
    } else {
      logger.info(`SKIP assignment: ${sku} — ${outcome.reason}`)
    }
  }

  const outPath = resolveOutputPath("MVP_MEDIA_EXECUTOR_OUTPUT", EXECUTOR_OUTPUT_DEFAULT)
  const outDir = path.dirname(outPath)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const repoRoot = path.resolve(process.cwd(), "../..")
  let inputArtifactRel = path.relative(repoRoot, path.resolve(inputPath)).replace(/\\/g, "/")
  if (inputArtifactRel.startsWith("..")) {
    inputArtifactRel = DRY_RUN_INPUT_DEFAULT
  }

  const applyAttempts: ApplyAttemptRow[] = []
  let applyErrorMessage: string | null = null

  if (apply) {
    const allowTemp = allowTemporaryStaticApply()
    const toApply = eligibleRows.filter((r) => {
      if (!r.apply_allowed_in_future) return false
      if (isTemporaryNonWhiteEligibleRow(r)) {
        if (!allowTemp) {
          return false
        }
      }
      return true
    })

    if (toApply.length === 0) {
      const blockedByTempEnv = eligibleRows.filter(
        (r) => r.apply_allowed_in_future && isTemporaryNonWhiteEligibleRow(r) && !allowTemp
      )
      if (blockedByTempEnv.length > 0) {
        logger.info(
          `Apply mode: ${blockedByTempEnv.length} temporary_non_white_static_local row(s) skipped — set MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1 (with CONFIRM) to allow DB apply for this class.`
        )
      }
      logger.info("Apply mode: no rows selected for DB write after gates; no DB writes.")
    } else {
      const needsLocalUpload = toApply.some((r) => !isStaticHttpUrl(r.proposed_image.trim()))
      let fileModule: FileModuleLike | null = null
      if (needsLocalUpload) {
        try {
          fileModule = container.resolve(Modules.FILE) as FileModuleLike
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error(
            `Apply requires Medusa FILE module for local source paths, but resolve(Modules.FILE) failed: ${msg}`
          )
          process.exit(1)
        }
      }

      const productModule = container.resolve(Modules.PRODUCT) as {
        listProducts: (
          filters: Record<string, unknown>,
          config?: { take?: number; relations?: string[] }
        ) => Promise<ProductRow[]>
        updateProducts: (
          idOrSelector: string | Record<string, unknown>,
          data: { thumbnail?: string | null; images?: Array<{ url: string }> }
        ) => Promise<unknown>
      }

      const allTokens = new Set<string>()
      for (const row of toApply) {
        for (const t of expandSkuOrHandleTokens(row.product_sku_or_handle)) {
          allTokens.add(t)
        }
      }
      const tokenList = [...allTokens]
      // Medusa v2 product listProducts does not support a product-level `sku` filter; SKU lives on variants.
      // Resolve candidates by handle (normalized lowercase) first, then widen scan if any row still unmatched.
      const handleCandidates = [...new Set(tokenList.map((t) => t.toLowerCase()))]
      let listed = await productModule.listProducts(
        { handle: handleCandidates },
        { take: Math.max(500, handleCandidates.length * 4), relations: ["variants", "images"] }
      )
      let products = listed ?? []
      let idx = indexProducts(products)
      const unresolved = toApply.filter((r) => !findProductForRow(r, idx))
      if (unresolved.length > 0) {
        logger.info(
          `Apply: widening product search (${unresolved.length} row(s) not resolved by handle filter; loading batch for variant SKU match).`
        )
        const all = await productModule.listProducts(
          {},
          { take: 2500, relations: ["variants", "images"] }
        )
        const merged = new Map<string, ProductRow>()
        for (const p of [...products, ...(all ?? [])]) {
          merged.set(p.id, p)
        }
        products = [...merged.values()]
        idx = indexProducts(products)
      }


      for (const row of toApply) {
        const resolved = await resolveTargetUrlForApply(row.proposed_image, fileModule, logger)
        if (!resolved.ok) {
          applyAttempts.push({
            product_sku_or_handle: row.product_sku_or_handle,
            collection_key: row.collection_key,
            outcome: "error",
            detail: resolved.detail,
          })
          continue
        }
        const targetUrl = resolved.url
        const product = findProductForRow(row, idx)
        if (!product) {
          applyAttempts.push({
            product_sku_or_handle: row.product_sku_or_handle,
            collection_key: row.collection_key,
            outcome: "error",
            detail: "product_not_found_in_db",
            target_url: targetUrl,
          })
          logger.warn(`Apply: no product for ${row.product_sku_or_handle}`)
          continue
        }

        const thumb = normalizeUrl(product.thumbnail)
        const urls = extractImageUrls(product.images as ProductImage[] | undefined)
        const first = urls[0] ?? null
        if (thumb === targetUrl && first === targetUrl) {
          applyAttempts.push({
            product_sku_or_handle: row.product_sku_or_handle,
            collection_key: row.collection_key,
            outcome: "unchanged",
            detail: "thumbnail_and_images0_already_target",
            medusa_product_id: product.id,
            medusa_handle: product.handle,
            target_url: targetUrl,
          })
          continue
        }

        const nextImages = buildSyncedImages(targetUrl, urls)
        if (nextImages.length === 0) {
          applyAttempts.push({
            product_sku_or_handle: row.product_sku_or_handle,
            collection_key: row.collection_key,
            outcome: "error",
            detail: "would_produce_empty_images",
            medusa_product_id: product.id,
            medusa_handle: product.handle,
            target_url: targetUrl,
          })
          continue
        }

        await productModule.updateProducts(product.id, {
          thumbnail: targetUrl,
          images: nextImages,
        })
        applyAttempts.push({
          product_sku_or_handle: row.product_sku_or_handle,
          collection_key: row.collection_key,
          outcome: "updated",
          detail: "thumbnail_and_images_written",
          medusa_product_id: product.id,
          medusa_handle: product.handle,
          target_url: targetUrl,
        })
        logger.info(`APPLIED media for ${product.handle} (${row.product_sku_or_handle})`)
      }

      const errCount = applyAttempts.filter((a) => a.outcome === "error").length
      if (errCount > 0) {
        applyErrorMessage = `MVP media apply finished with ${errCount} error row(s); see apply_attempts in artifact and logs.`
      }
    }
  }

  const tempEligible = eligibleRows.filter((r) => r.eligibility_class === ELIGIBILITY_TEMP_STATIC)
  const whiteEligible = eligibleRows.filter((r) => r.eligibility_class === ELIGIBILITY_WHITE_BG)

  const artifact: Record<string, unknown> = {
    audit_meta: {
      pass_name: apply
        ? "storefront_mvp_media_assignment_executor_apply"
        : "storefront_mvp_media_assignment_executor_dry_run",
      pass_kind: apply ? "controlled_executor_apply" : "controlled_executor_dry_run_only",
      generated_date: new Date().toISOString().slice(0, 10),
      input_artifact: inputArtifactRel,
    },
    source_files_checked: [
      inputArtifactRel,
      "apps/backend/src/scripts/apply-mvp-media-assignments.ts",
      "docs/storefront/mvp-media-assignment-dry-run.md",
    ],
    executor: {
      script_relative: "apps/backend/src/scripts/apply-mvp-media-assignments.ts",
      package_script: "mvp-media-assignments",
    },
    temporary_non_white_static_policy: {
      temporary_non_white_static_allowed: true,
      temporary_non_white_static_scope: "confirmed_local_static_only",
      production_media_claim: false,
      requires_later_white_background_replacement: true,
      apply_env_gate: "MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1",
      dry_run_eligible_count: tempEligible.length,
    },
    dry_run_only: !apply,
    eligible_rows: eligibleRows,
    skipped_rows: skippedRows,
    summary: {
      eligible_count: eligibleRows.length,
      eligible_white_background_v1_count: whiteEligible.length,
      eligible_temporary_non_white_static_local_count: tempEligible.length,
      skipped_count: skippedRows.length,
      assignments_scanned: assignmentsScanned,
      source_skipped_rows_mirrored: sourceSkippedMirrored,
    },
    apply_guardrails: [
      "No new products; no commercial metadata changes; no collection stage/readiness mutation; no catalog-scope edits.",
      "Oxford-4 and eligible_but_paused_scope rows are never promoted by this executor.",
      "Class A apply: white_background + eligible_for_future_apply + CONFIRM=1; local path or http(s) URL.",
      "Class B dry-run: eligible_temporary_local_visual_ready + backend_static_existing + local file + needs_later_white_background_replacement; Oxford excluded; collection_status not blocked.",
      "Class B apply: additionally requires MVP_MEDIA_ASSIGNMENTS_ALLOW_TEMPORARY_STATIC=1 (no production_media_claim; later white-bg replacement required).",
      "DB writes (--apply only): product thumbnail + images only; no variant/price/metadata.",
    ],
  }

  if (apply) {
    artifact.apply_attempts = applyAttempts
    artifact.apply_summary = {
      attempted: applyAttempts.length,
      updated: applyAttempts.filter((a) => a.outcome === "updated").length,
      unchanged: applyAttempts.filter((a) => a.outcome === "unchanged").length,
      errors: applyAttempts.filter((a) => a.outcome === "error").length,
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf-8")
  logger.info(`Wrote executor artifact: ${outPath}`)
  logger.info(
    `Done. eligible=${eligibleRows.length} skipped=${skippedRows.length} (includes mirrored source skipped[]).`
  )

  if (applyErrorMessage) {
    throw new Error(applyErrorMessage)
  }
}
