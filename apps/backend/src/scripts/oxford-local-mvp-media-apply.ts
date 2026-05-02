/**
 * Oxford local MVP media — optional DB apply (thumbnail + images only).
 *
 * Does NOT run seed, validation, sync, or Oxford pilot four runner.
 * Does NOT create products or change metadata, prices, catalog-scope, or evidence JSON.
 *
 * From apps/backend:
 *   yarn oxford-local-mvp-media:apply
 *       → logs only; canonical dry-run snapshot is produced by
 *         `node ../../scripts/build-oxford-local-mvp-media-artifacts.mjs`
 *   OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1 yarn oxford-local-mvp-media:apply -- --apply
 *       → applies rows with `local_mvp_apply_allowed: true` from
 *         `data/normalized/oxford-local-mvp-media-assignment-plan.json`
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const PLAN_REL = "data/normalized/oxford-local-mvp-media-assignment-plan.json"
const OUT_REL = "data/normalized/oxford-local-mvp-media-apply-result.json"

type PlanRow = {
  sku: string
  handle: string
  product_in_local_medusa_db?: boolean
  local_mvp_apply_allowed?: boolean
  proposed_primary_url?: string | null
  proposed_gallery_urls?: string[]
}

function repoRootFromBackendCwd(): string {
  const c = process.cwd()
  if (path.basename(c) === "backend" && path.basename(path.dirname(c)) === "apps") {
    return path.resolve(c, "../..")
  }
  return path.resolve(c, "../..")
}

function wantsApply(): boolean {
  return process.argv.includes("--apply")
}

function applyConfirmOk(): boolean {
  return process.env.OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM === "1"
}

function normalizeUrl(u: string | null | undefined): string {
  return (u || "").trim()
}

function buildSyncedImages(thumbnail: string, gallery: string[]): { url: string }[] {
  const thumb = normalizeUrl(thumbnail)
  const rest = gallery.map(normalizeUrl).filter((u) => u && u !== thumb)
  return [thumb, ...rest].map((url) => ({ url }))
}

export default async function oxfordLocalMvpMediaApply({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void; error: (s: string) => void }

  const apply = wantsApply()
  if (apply && !applyConfirmOk()) {
    logger.error(
      "Refusing --apply: set OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1 (e.g. OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1 yarn oxford-local-mvp-media:apply -- --apply)."
    )
    process.exit(1)
  }

  const root = repoRootFromBackendCwd()
  const planPath = path.join(root, PLAN_REL)
  if (!fs.existsSync(planPath)) {
    logger.error(`Assignment plan not found: ${planPath}`)
    process.exit(1)
  }

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as { rows?: PlanRow[] }
  const rows = plan.rows ?? []
  const targets = rows.filter((r) => r.local_mvp_apply_allowed && r.proposed_primary_url)

  if (!apply) {
    logger.info(
      `Oxford local MVP media apply: no DB writes (pass --apply with OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1). ` +
        `Eligible rows in plan: ${targets.length}. Dry-run snapshot: ${OUT_REL} (from build script).`
    )
    return
  }

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<Array<{ id: string; handle: string; thumbnail?: string | null; images?: Array<{ url?: string }> }>>
    updateProducts: (
      id: string,
      data: { thumbnail?: string | null; images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }

  const handles = [...new Set(targets.map((t) => t.handle.toLowerCase()))]
  const listed = await productModule.listProducts(
    { handle: handles },
    { take: Math.max(50, handles.length * 4), relations: ["images", "variants"] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle.toLowerCase(), p]))

  const applyAttempts: Array<Record<string, unknown>> = []

  for (const row of targets) {
    const product = byHandle.get(row.handle.toLowerCase())
    const primary = normalizeUrl(row.proposed_primary_url || "")
    const gallery = (row.proposed_gallery_urls ?? []).map(normalizeUrl).filter(Boolean)

    if (!product) {
      applyAttempts.push({
        sku: row.sku,
        handle: row.handle,
        outcome: "error",
        detail: "product_not_found_in_db",
      })
      continue
    }
    if (!primary.startsWith("http")) {
      applyAttempts.push({
        sku: row.sku,
        handle: row.handle,
        outcome: "error",
        detail: "primary_not_http_url",
      })
      continue
    }

    const beforeThumb = product.thumbnail
    const beforeUrls = (product.images ?? []).map((i) => i?.url).filter(Boolean) as string[]
    const nextImages = buildSyncedImages(primary, gallery)

    await productModule.updateProducts(product.id, {
      thumbnail: primary,
      images: nextImages,
    })

    applyAttempts.push({
      sku: row.sku,
      handle: row.handle,
      outcome: "updated",
      medusa_product_id: product.id,
      before_thumbnail: beforeThumb ?? null,
      after_thumbnail: primary,
      before_gallery_urls: beforeUrls,
      after_gallery_urls: nextImages.map((i) => i.url),
    })
    logger.info(`Updated media for ${row.handle} (${row.sku})`)
  }

  const outPath = path.join(root, OUT_REL)
  const artifact = {
    audit_meta: {
      pass_name: "oxford_local_mvp_media_apply_executed",
      generated_at: new Date().toISOString(),
      mode: "apply",
    },
    local_apply_status: "apply_completed",
    apply_attempts: applyAttempts,
    apply_summary: {
      attempted: applyAttempts.length,
      updated: applyAttempts.filter((a) => a.outcome === "updated").length,
      errors: applyAttempts.filter((a) => a.outcome === "error").length,
    },
    guardrails: [
      "Oxford remains PAUSED in storefront catalog-scope governance; this script does not edit catalog-scope.ts.",
      "No new products; thumbnail + images only; no metadata / prices / collection stage changes.",
      "Not production rollout; interim/non-white URLs allowed for local preview only.",
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf-8")
  logger.info(`Wrote ${outPath}`)
}
