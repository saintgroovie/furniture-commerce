/**
 * Oliver-only thumbnail backfill for a fixed approved handle list.
 *
 * - Source of truth: `data/oliver/oliver-thumbnail-approved-mapping.json` (under apps/backend; Docker
 *   bind-mounts only this app). Mirror: `docs/project/oliver-thumbnail-approved-mapping.json`.
 * - Optionally verifies each `source_basename` against `data/processed/asset-manifests/processed-assets.json`
 *   when that file is present (full monorepo checkout); skipped inside minimal backend containers.
 * - Updates `thumbnail` only (does not touch `images`, metadata, variants, prices).
 * - Idempotent: skips when thumbnail already equals target URL.
 * - Verifies static file exists under `static/products/oliver/` before writing.
 *
 * Run from apps/backend: yarn refresh-oliver-thumbnails
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const OLIVER_STATIC_PREFIX = "/static/products/oliver/"

type ApprovedRow = {
  handle: string
  approved_source_path: string
  source_basename: string
  resolved_static_filename: string
  serving_path: string
}

type ApprovedFile = {
  handles: ApprovedRow[]
}

type ProcessedAssetRow = {
  source_raw_path?: string
  processed_filename?: string
  collection_name_normalized?: string
}

type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
}

function loadApprovedMapping(): ApprovedRow[] {
  const candidates = [
    path.join(process.cwd(), "data/oliver/oliver-thumbnail-approved-mapping.json"),
    path.resolve(process.cwd(), "../../docs/project/oliver-thumbnail-approved-mapping.json"),
    path.join(process.cwd(), "docs/project/oliver-thumbnail-approved-mapping.json"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8")) as ApprovedFile
      if (!Array.isArray(raw.handles) || raw.handles.length === 0) {
        throw new Error(`Invalid approved mapping file: ${candidate}`)
      }
      return raw.handles
    }
  }
  throw new Error(`oliver-thumbnail-approved-mapping.json not found. Tried:\n${candidates.join("\n")}`)
}

function tryLoadProcessedAssets(): ProcessedAssetRow[] | null {
  const candidates = [
    path.resolve(process.cwd(), "../../data/processed/asset-manifests/processed-assets.json"),
    path.join(process.cwd(), "data/processed/asset-manifests/processed-assets.json"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8")) as ProcessedAssetRow[]
      return Array.isArray(raw) ? raw : []
    }
  }
  return null
}

function basenameLower(p: string): string {
  return path.basename(p.trim()).toLowerCase()
}

/**
 * Map raw download basename -> processed_filename for Oliver rows only.
 * Match exact basename at end of source_raw_path (case-insensitive).
 */
function buildBasenameToProcessedMap(rows: ProcessedAssetRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    const sr = row.source_raw_path
    const pf = row.processed_filename
    if (!sr || !pf) continue
    if (!sr.toLowerCase().includes("/oliver/")) continue
    const base = path.basename(sr).toLowerCase()
    const prev = map.get(base)
    if (prev && prev !== pf) {
      throw new Error(
        `Ambiguous processed-assets mapping for basename "${base}": "${prev}" vs "${pf}"`
      )
    }
    map.set(base, pf)
  }
  return map
}

function backendBaseUrl(): string {
  const raw = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  return raw.replace(/\/$/, "")
}

function toThumbnailUrl(servingPath: string): string {
  const sp = servingPath.startsWith("/") ? servingPath : `/${servingPath}`
  return `${backendBaseUrl()}${sp}`
}

function staticFileAbsolute(processedFilename: string): string {
  return path.join(process.cwd(), "static", "products", "oliver", processedFilename)
}

export default async function refreshOliverThumbnails({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void; warn: (s: string) => void }
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<ProductRow[]>
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { thumbnail?: string | null }
    ) => Promise<unknown>
  }

  logger.info("=== Oliver thumbnail backfill (approved list) ===")

  const approved = loadApprovedMapping()
  const processedRows = tryLoadProcessedAssets()
  const basenameMap = processedRows ? buildBasenameToProcessedMap(processedRows) : null
  if (!basenameMap) {
    logger.info("processed-assets.json not found — skipping manifest cross-check (Docker / minimal tree).")
  }

  const handleList = approved.map((r) => r.handle)
  const listed = await productModule.listProducts(
    { handle: handleList },
    { take: Math.max(64, handleList.length), relations: [] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle, p]))

  let updated = 0
  let unchanged = 0
  const errors: string[] = []

  for (const row of approved) {
    const product = byHandle.get(row.handle)
    if (!product) {
      errors.push(`No Medusa product found for handle "${row.handle}".`)
      continue
    }

    const base = basenameLower(row.source_basename || row.approved_source_path)
    const baseFromPath = basenameLower(row.approved_source_path)
    if (base !== baseFromPath) {
      errors.push(
        `source_basename vs approved_source_path mismatch for "${row.handle}": "${row.source_basename}" vs path ending "${baseFromPath}".`
      )
      continue
    }

    if (basenameMap) {
      const resolvedFromManifest = basenameMap.get(base)
      if (!resolvedFromManifest) {
        errors.push(
          `Cannot resolve approved basename "${base}" for handle "${row.handle}" in processed-assets.json.`
        )
        continue
      }
      if (resolvedFromManifest !== row.resolved_static_filename) {
        errors.push(
          `Resolved filename mismatch for "${row.handle}": mapping JSON has "${row.resolved_static_filename}" but processed-assets.json has "${resolvedFromManifest}". Refusing to write.`
        )
        continue
      }
    }

    const abs = staticFileAbsolute(row.resolved_static_filename)
    if (!fs.existsSync(abs)) {
      errors.push(
        `Static file missing for "${row.handle}": expected at ${abs} (processed_filename=${row.resolved_static_filename}).`
      )
      continue
    }

    const targetUrl = toThumbnailUrl(row.serving_path)
    const current = product.thumbnail ?? null
    if (current === targetUrl) {
      unchanged++
      continue
    }

    await productModule.updateProducts(product.id, { thumbnail: targetUrl })
    updated++
    logger.info(`Updated thumbnail for ${row.handle} -> ${targetUrl}`)
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.warn(`ERROR: ${e}`)
    }
    throw new Error(`Oliver thumbnail backfill failed with ${errors.length} error(s). See logs above.`)
  }

  logger.info(`Updated: ${updated}, unchanged (already correct): ${unchanged}.`)
  logger.info("=== Oliver thumbnail backfill complete ===")
}
