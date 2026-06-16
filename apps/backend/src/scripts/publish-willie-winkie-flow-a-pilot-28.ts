/**
 * Willie Winkie Flow A — whitelist publish (28 handles only).
 *
 * Dry-run:
 *   WW_FLOW_A_PUBLISH_DRY_RUN=1 WW_FLOW_A_PUBLISH_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/publish-willie-winkie-flow-a-pilot-28.ts
 *
 * Apply:
 *   WW_FLOW_A_PUBLISH_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/publish-willie-winkie-flow-a-pilot-28.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const EXCLUDED = new Set(["co-02-1", "am-02-1"])
const WHITELIST_PATH = "tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json"
const OUT_DIR = "tmp/flow-a-publish-apply-gate"
const OXFORD_HANDLES = ["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"]
const REQUIRED_COLLECTION = "willie-winkie"
const REQUIRED_KIDS = {
  storefront_section: "kids",
  room_type: "детская",
  cart_group: "Woodright Kids",
}

type WhitelistFile = { handles: string[] }

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

function metaStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function validatePilotProduct(
  handle: string,
  product: Record<string, unknown>,
  blockers: string[]
): void {
  const status = String(product.status ?? "")
  if (status !== "draft" && status !== "published") {
    blockers.push(`${handle}:invalid_status:${status}`)
  }
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  if (metaStr(meta.launch_mode) !== "request_quote") {
    blockers.push(`${handle}:launch_mode`)
  }
  if (metaStr(meta.cart_group) !== REQUIRED_KIDS.cart_group) {
    blockers.push(`${handle}:cart_group`)
  }
  if (metaStr(meta.collection) !== REQUIRED_COLLECTION) {
    blockers.push(`${handle}:collection`)
  }
  if (metaStr(meta.storefront_section) !== REQUIRED_KIDS.storefront_section) {
    blockers.push(`${handle}:storefront_section`)
  }
  if (metaStr(meta.room_type) !== REQUIRED_KIDS.room_type) {
    blockers.push(`${handle}:room_type`)
  }
  const thumb = product.thumbnail
  const images = product.images as unknown[] | undefined
  if (typeof thumb !== "string" || thumb.trim().length < 8) {
    blockers.push(`${handle}:missing_thumbnail`)
  }
  if (!Array.isArray(images) || images.length < 1) {
    blockers.push(`${handle}:missing_images`)
  }
}

export default async function publishWillieWinkieFlowAPilot28({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.WW_FLOW_A_PUBLISH_DRY_RUN === "1"
  const root = repoRoot()
  const outDir = path.join(root, OUT_DIR)
  fs.mkdirSync(outDir, { recursive: true })

  if (process.env.WW_FLOW_A_PUBLISH_CONFIRM !== "1") {
    logger.info("Skipped. Set WW_FLOW_A_PUBLISH_CONFIRM=1 (use WW_FLOW_A_PUBLISH_DRY_RUN=1 for dry-run).")
    return
  }

  const whitelistFile = loadJson<WhitelistFile>(root, WHITELIST_PATH)
  const handles = whitelistFile.handles.map((h) => h.toLowerCase())

  if (handles.length !== 28) {
    throw new Error(`Whitelist must have 28 handles, got ${handles.length}`)
  }
  const unique = new Set(handles)
  if (unique.size !== 28) {
    throw new Error(`Whitelist has duplicate handles (${unique.size} unique)`)
  }
  for (const ex of EXCLUDED) {
    if (unique.has(ex)) throw new Error(`Excluded handle in whitelist: ${ex}`)
  }

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await productModule.listProducts(
    { handle: [...unique] },
    { take: 40, relations: ["images", "variants"] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle?.toLowerCase(), p]))

  const blockers: string[] = []
  const attempts: Record<string, unknown>[] = []

  for (const handle of [...unique].sort()) {
    const product = byHandle.get(handle)
    if (!product?.id) {
      blockers.push(`missing_product:${handle}`)
      continue
    }
    validatePilotProduct(handle, product as unknown as Record<string, unknown>, blockers)

    const status = String(product.status ?? "")
    if (status === "published") {
      attempts.push({
        handle,
        product_id: product.id,
        outcome: dryRun ? "dry_run_skip_already_published" : "skip_already_published",
        status,
      })
      continue
    }

    if (status !== "draft") {
      blockers.push(`${handle}:not_draft:${status}`)
      continue
    }

    if (dryRun) {
      attempts.push({
        handle,
        product_id: product.id,
        outcome: "dry_run_would_publish",
        status_before: status,
      })
      continue
    }

    await productModule.updateProducts(product.id, { status: "published" })
    attempts.push({
      handle,
      product_id: product.id,
      outcome: "published",
      status_before: "draft",
      status_after: "published",
    })
    logger.info(`Published ${handle}`)
  }

  const oxListed = await productModule.listProducts(
    { handle: OXFORD_HANDLES },
    { take: 10, relations: ["images"] }
  )
  for (const ox of oxListed ?? []) {
    if (String(ox.status) !== "published") {
      blockers.push(`oxford_status_changed:${ox.handle}`)
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry_run" : "apply",
    whitelist_path: WHITELIST_PATH,
    handle_count: unique.size,
    blockers,
    attempts,
    summary: {
      would_publish: attempts.filter((a) => a.outcome === "dry_run_would_publish").length,
      published: attempts.filter((a) => a.outcome === "published").length,
      skipped: attempts.filter((a) => String(a.outcome).includes("skip")).length,
      errors: blockers.length,
    },
    verdict:
      blockers.length > 0
        ? "blocked_before_publish"
        : dryRun
          ? "publish_dry_run_ready_apply_not_run"
          : attempts.some((a) => a.outcome === "published")
            ? "published"
            : "publish_noop",
  }

  const outPath = path.join(outDir, dryRun ? "publish-dry-run-result.json" : "publish-apply-result.json")
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
  logger.info(`Wrote ${outPath}`)
  logger.info(`Verdict: ${report.verdict}`)

  if (blockers.length > 0) {
    for (const b of blockers) logger.info(`  blocker: ${b}`)
    throw new Error(`Publish blocked (${blockers.length} blocker(s))`)
  }
}
