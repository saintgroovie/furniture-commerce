/**
 * Applies `metadata.collection` (and `metadata.collection_label`) for the
 * foundational `oliver-kids` subset defined in:
 *   `data/normalized/oliver-kids-backfill-candidate-manifest.json`
 *
 * Safety:
 * - Default: dry-run only (no writes). Pass `--apply` to persist.
 * - Only `foundational_subset` rows are considered; `needs_review` / `excluded` are ignored.
 * - Each target must currently have `metadata.collection === "oliver"` (or already `oliver-kids` for idempotency).
 * - Does not touch Greenwich, seed files, or storefront.
 *
 * Run from apps/backend:
 *   yarn apply-oliver-kids-manifest
 *   yarn apply-oliver-kids-manifest -- --apply
 *
 * Optional: OLIVER_KIDS_MANIFEST_PATH=/absolute/or/relative/path/to/manifest.json
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const OLIVER = "oliver" as const
const OLIVER_KIDS = "oliver-kids" as const
/** Canonical label: see docs/storefront/naming-system.md */
const OLIVER_KIDS_COLLECTION_LABEL = "Oliver Kids" as const

type FoundationalRow = {
  product_id: string
  handle: string
  title?: string
  current_collection: string
  proposed_collection: string
}

type Manifest = {
  foundational_subset: FoundationalRow[]
}

function loadManifest(): Manifest {
  const envPath = process.env.OLIVER_KIDS_MANIFEST_PATH
  const candidates = [
    envPath && path.isAbsolute(envPath) ? envPath : null,
    envPath ? path.join(process.cwd(), envPath) : null,
    path.join(process.cwd(), "data/normalized/oliver-kids-backfill-candidate-manifest.json"),
    path.resolve(process.cwd(), "../../data/normalized/oliver-kids-backfill-candidate-manifest.json"),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8")) as Manifest
      if (!Array.isArray(raw.foundational_subset)) {
        throw new Error(`Invalid manifest: missing foundational_subset[] in ${candidate}`)
      }
      return raw
    }
  }
  throw new Error(`Manifest not found. Tried:\n${candidates.join("\n")}`)
}

function wantsApply(): boolean {
  return process.argv.includes("--apply")
}

export default async function applyOliverKidsManifest({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void; warn: (s: string) => void }
  const apply = wantsApply()
  const manifest = loadManifest()
  const rows = manifest.foundational_subset

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<
      Array<{ id: string; handle: string; metadata?: Record<string, unknown> | null }>
    >
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }

  logger.info(`=== Oliver Kids manifest (${apply ? "APPLY" : "DRY-RUN"}) ===`)
  logger.info(`Foundational rows: ${rows.length}`)

  const handles = rows.map((r) => r.handle)
  let listed = await productModule.listProducts(
    { handle: handles },
    { take: Math.max(64, handles.length), relations: [] }
  )
  let products = (listed ?? []).filter((p) => handles.includes(p.handle))
  if (products.length === 0 && handles.length > 0) {
    const all = await productModule.listProducts({}, { take: 2500, relations: [] })
    products = (all ?? []).filter((p) => handles.includes(p.handle))
  }

  const byHandle = new Map(products.map((p) => [p.handle, p]))

  let wouldUpdate = 0
  let skipped = 0

  for (const row of rows) {
    const pr = byHandle.get(row.handle)
    if (!pr) {
      logger.warn(`  SKIP (not in DB): ${row.handle}`)
      skipped++
      continue
    }
    if (pr.id !== row.product_id) {
      logger.warn(
        `  WARN id mismatch handle=${row.handle} manifest_id=${row.product_id} db_id=${pr.id} — using DB product`
      )
    }

    const meta = (pr.metadata && typeof pr.metadata === "object" && !Array.isArray(pr.metadata)
      ? { ...pr.metadata }
      : {}) as Record<string, unknown>

    const current = meta.collection
    if (current === OLIVER_KIDS) {
      logger.info(`  OK (already ${OLIVER_KIDS}): ${row.handle}`)
      continue
    }
    if (current !== OLIVER) {
      logger.warn(
        `  SKIP (expected metadata.collection="${OLIVER}", got ${String(current)}): ${row.handle}`
      )
      skipped++
      continue
    }

    const nextMeta: Record<string, unknown> = {
      ...meta,
      collection: OLIVER_KIDS,
      collection_label: OLIVER_KIDS_COLLECTION_LABEL,
    }

    if (apply) {
      await productModule.updateProducts(pr.id, { metadata: nextMeta })
      logger.info(`  UPDATED: ${row.handle} -> ${OLIVER_KIDS}`)
    } else {
      logger.info(`  WOULD UPDATE: ${row.handle} -> ${OLIVER_KIDS} (collection_label=${OLIVER_KIDS_COLLECTION_LABEL})`)
    }
    wouldUpdate++
  }

  if (!apply) {
    logger.info(`Dry-run complete. ${wouldUpdate} product(s) would be updated. Re-run with --apply to write.`)
  } else {
    logger.info(`Apply complete. Updated ${wouldUpdate} product(s).`)
  }
  if (skipped > 0) {
    logger.info(`Skipped: ${skipped}`)
  }
  logger.info("=== Oliver Kids manifest finished ===")
}
