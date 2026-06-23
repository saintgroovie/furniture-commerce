/**
 * Gated apply: Country assignment_v2 export → Medusa product media (whitelist 13 handles only).
 *
 * Dry-run:
 *   COUNTRY_ASSIGN_V2_DRY_RUN=1 COUNTRY_ASSIGN_V2_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-country-assignment-v2-gated.ts
 *
 * Apply:
 *   COUNTRY_ASSIGN_V2_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-country-assignment-v2-gated.ts
 *
 * Optional:
 *   COUNTRY_ASSIGN_V2_EXPORT=tmp/country-assignment-v2-2026-06-23/operator-assignment-v2-export.json
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  buildBuyerGallery,
  pickBuyerThumbnail,
  sortFinishExecutions,
  sortUrlsByBuyerPolicy,
  toMedusaImages,
} from "../lib/gallery-buyer-sort"
import { countryFinishLabel, sortCountryFinishExecutionsMilkFirst, syncCountryPaintFinishMetadata } from "../lib/country-finish-labels"

const WHITELIST = new Set([
  "co-05-1",
  "co-02-1",
  "co-08-1",
  "co-14-2",
  "co-15-2",
  "co-61-1",
  "co-62-1",
  "co-62-2",
  "co-62-3",
  "co-65-1",
  "co-65-2",
  "co-66-1",
  "co-69-1",
])
const COLLECTION = "country-london-paris"
const DEFAULT_EXPORT = "tmp/country-assignment-v2-2026-06-23/operator-assignment-v2-export.json"
const INVENTORY = "data/normalized/legacy-media-inventory.json"
const SEED = "data/normalized/seed-products.json"
const PSEUDO_NEEDS_COLOR = "__needs_color__"

type ExportMediaRef = {
  id: string
  filename: string
  source_path: string
  preview_status?: string
}

type ExportVariant = {
  main: ExportMediaRef | null
  gallery: ExportMediaRef[]
  role_assignments?: Record<string, ExportMediaRef>
  operator_variant_label?: string
}

type ExportProduct = {
  handle: string
  title: string | null
  collection: string | null
  variants: Record<string, ExportVariant>
  operator_variant_edits?: { default_variant_key?: string }
}

type AssignmentV2Payload = {
  export_kind: string
  assignment: {
    assignments: Record<string, ExportProduct>
  }
}

type InvItem = {
  id: string
  repo_relative_path?: string | null
  source_path?: string | null
  filename?: string | null
  exists_locally?: boolean
  collection_hint?: string | null
}

type V2ProductState = {
  handle: string
  activeVariantKey?: string
  rolesByVariant: Record<string, Record<string, string | null | undefined>>
  galleriesByVariant: Record<string, string[]>
  variantLabelOverrides?: Record<string, string>
}

type SeedRow = {
  medusa_product_handle: string
  medusa_collection_handle?: string
  medusa_category_handle?: string
  canonical_name?: string
  workbook_row_key?: string
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
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

function absToRelativeStatic(url: string): string {
  const m = url.match(/(\/static\/products\/[^\s?#]+)/i)
  return m ? m[1]! : url
}

function invDiskPath(root: string, inv: InvItem): string {
  const rel = (inv.repo_relative_path || inv.source_path || "").replace(/\\/g, "/").replace(/^\//, "")
  if (!rel) return ""
  if (rel.startsWith("apps/backend/") || rel.startsWith("data/")) {
    return path.join(root, rel)
  }
  return path.join(root, "apps/backend", rel)
}

function invToRelativeStatic(inv: InvItem): string | null {
  const raw = (inv.repo_relative_path || inv.source_path || "").replace(/\\/g, "/")
  if (!raw) return null
  const idx = raw.indexOf("/static/")
  if (idx >= 0) return raw.slice(idx)
  if (raw.startsWith("static/")) return `/${raw}`
  return null
}

function invFromRef(ref: ExportMediaRef): InvItem {
  return {
    id: ref.id,
    filename: ref.filename,
    source_path: ref.source_path,
    repo_relative_path: ref.source_path,
    collection_hint: COLLECTION,
  }
}

function stageStaticUrl(
  root: string,
  base: string,
  inv: InvItem,
  dryRun: boolean
): string | null {
  const disk = invDiskPath(root, inv)
  if (!disk || !fs.existsSync(disk)) return null

  const existing = invToRelativeStatic(inv)
  if (existing) return `${base}${existing}`

  const collection = inv.collection_hint || COLLECTION
  const destRel = `/static/products/${collection}/${path.basename(disk)}`
  const destDisk = path.join(root, "apps/backend", destRel.replace(/^\//, ""))
  if (!dryRun) {
    fs.mkdirSync(path.dirname(destDisk), { recursive: true })
    if (!fs.existsSync(destDisk)) fs.copyFileSync(disk, destDisk)
  }
  return `${base}${destRel}`
}

function resolveMedusaProductHandle(handle: string): string[] {
  const candidates = [handle]
  const latinN = handle.replace(/н/g, "n").replace(/Н/g, "N")
  if (latinN !== handle) candidates.push(latinN)
  return [...new Set(candidates)]
}

function exportToProductState(product: ExportProduct): V2ProductState {
  const rolesByVariant: Record<string, Record<string, string | null>> = {}
  const galleriesByVariant: Record<string, string[]> = {}
  const variantLabelOverrides: Record<string, string> = {}

  for (const [vk, variant] of Object.entries(product.variants || {})) {
    const roles: Record<string, string | null> = {}
    if (variant.main?.id) roles.main = variant.main.id
    for (const [slot, ref] of Object.entries(variant.role_assignments || {})) {
      if (ref?.id) roles[slot] = ref.id
    }
    rolesByVariant[vk] = roles
    galleriesByVariant[vk] = (variant.gallery || []).map((g) => g.id).filter(Boolean)
    if (variant.operator_variant_label) {
      variantLabelOverrides[vk] = variant.operator_variant_label
    }
  }

  return {
    handle: product.handle,
    activeVariantKey: product.operator_variant_edits?.default_variant_key,
    rolesByVariant,
    galleriesByVariant,
    variantLabelOverrides,
  }
}

function collectVariantMediaIds(state: V2ProductState, variantKey: string): string[] {
  const roles = state.rolesByVariant[variantKey] ?? {}
  const gallery = state.galleriesByVariant[variantKey] ?? []
  const ids: string[] = []
  const push = (id: string | null | undefined) => {
    if (!id || ids.includes(id)) return
    ids.push(id)
  }
  for (const id of Object.values(roles)) push(id as string)
  for (const id of gallery) push(id)
  return ids
}

function exportableVariantKeys(state: V2ProductState): string[] {
  const keys = new Set<string>()
  for (const k of Object.keys(state.rolesByVariant)) keys.add(k)
  for (const k of Object.keys(state.galleriesByVariant)) keys.add(k)
  return [...keys].filter((k) => k !== PSEUDO_NEEDS_COLOR)
}

function loadExport(root: string): AssignmentV2Payload {
  const rel = process.env.COUNTRY_ASSIGN_V2_EXPORT || DEFAULT_EXPORT
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) throw new Error(`Missing export: ${rel}`)
  const payload = JSON.parse(fs.readFileSync(p, "utf8")) as AssignmentV2Payload
  if (payload.export_kind !== "assignment_v2") {
    throw new Error(`export_kind must be assignment_v2, got ${payload.export_kind}`)
  }
  return payload
}

export default async function applyCountryAssignmentV2Gated({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.COUNTRY_ASSIGN_V2_DRY_RUN === "1"

  if (process.env.COUNTRY_ASSIGN_V2_CONFIRM !== "1") {
    logger.info("Skipped. Set COUNTRY_ASSIGN_V2_CONFIRM=1 (gated operator approval required)")
    return
  }

  const root = repoRoot()
  const base = backendBaseUrl(root)
  const payload = loadExport(root)
  const assignments = payload.assignment.assignments

  const inventory = JSON.parse(fs.readFileSync(path.join(root, INVENTORY), "utf8")) as {
    items: InvItem[]
  }
  const invById = new Map(inventory.items.map((i) => [i.id, i]))
  const seedRows = JSON.parse(fs.readFileSync(path.join(root, SEED), "utf8")) as SeedRow[]
  const seedByHandle = new Map(
    seedRows.map((r) => [r.medusa_product_handle.toLowerCase(), r])
  )

  const productModule = container.resolve(Modules.PRODUCT)
  let updated = 0
  let skipped = 0
  let missingFile = 0
  const touched: string[] = []

  for (const handle of [...WHITELIST].sort()) {
    const exportProduct = assignments[handle]
    if (!exportProduct) {
      logger.warn(`Skip missing export product: ${handle}`)
      skipped++
      continue
    }
    if (exportProduct.collection !== COLLECTION) {
      logger.warn(`Skip ${handle}: collection mismatch`)
      skipped++
      continue
    }

    const state = exportToProductState(exportProduct)
    const seed = seedByHandle.get(handle.toLowerCase())
    const collection = seed?.medusa_collection_handle?.toLowerCase() || COLLECTION

    const hasAssignment = exportableVariantKeys(state).some((vk) => {
      const roles = state.rolesByVariant[vk] ?? {}
      return Boolean(roles.main) || (state.galleriesByVariant[vk]?.length ?? 0) > 0
    })
    if (!hasAssignment) {
      skipped++
      continue
    }

    let product: Awaited<ReturnType<typeof productModule.listProducts>>[number] | undefined
    for (const medusaHandle of resolveMedusaProductHandle(handle)) {
      const listed = await productModule.listProducts(
        { handle: medusaHandle },
        { take: 1, relations: ["images", "variants"] }
      )
      if (listed?.[0]?.id) {
        product = listed[0]
        break
      }
    }
    if (!product?.id) {
      logger.warn(`Skip missing Medusa product: ${handle}`)
      skipped++
      continue
    }

    const activeKey =
      state.activeVariantKey ?? exportableVariantKeys(state)[0] ?? PSEUDO_NEEDS_COLOR
    const activeIds = collectVariantMediaIds(state, activeKey)
    const activeUrls: string[] = []
    for (const id of activeIds) {
      const inv = invById.get(id) ?? invFromRef(
        exportProduct.variants[activeKey]?.main?.id === id
          ? exportProduct.variants[activeKey]!.main!
          : (exportProduct.variants[activeKey]?.gallery || []).find((g) => g.id === id) ||
            ({ id, filename: id, source_path: "" } as ExportMediaRef)
      )
      const disk = invDiskPath(root, inv)
      if (inv.exists_locally === false || (disk && !fs.existsSync(disk))) {
        missingFile++
        continue
      }
      const url = stageStaticUrl(root, base, inv, dryRun)
      if (url) activeUrls.push(url)
    }

    if (activeUrls.length === 0) {
      logger.warn(`Skip ${handle}: no resolvable local static URLs`)
      skipped++
      continue
    }

    const roleByUrl = new Map<string, string>()
    for (const [slot, id] of Object.entries(state.rolesByVariant[activeKey] ?? {})) {
      if (!id || slot === "main") continue
      const inv = invById.get(id as string)
      const url = inv ? stageStaticUrl(root, base, inv, dryRun) : null
      if (url) roleByUrl.set(url, slot)
    }

    const galleryUrls = buildBuyerGallery(activeUrls, [], { handle, roleByUrl })
    const thumbnail = pickBuyerThumbnail(galleryUrls, handle) || galleryUrls[0]!

    const labels: Record<string, string> = {}
    let finishExecutions = exportableVariantKeys(state)
      .filter((vk) => collectVariantMediaIds(state, vk).length > 0)
      .map((vk) => {
        const operatorLabel = state.variantLabelOverrides?.[vk]
        const label = countryFinishLabel(handle, vk, operatorLabel)
        labels[vk] = label
        const urls: string[] = []
        for (const id of collectVariantMediaIds(state, vk)) {
          const inv = invById.get(id)
          if (!inv) continue
          const url = stageStaticUrl(root, base, inv, dryRun)
          if (url) urls.push(url)
        }
        const sorted = sortUrlsByBuyerPolicy([...new Set(urls)], { handle, roleByUrl })
        return { key: vk, label, urls: sorted.map((u) => absToRelativeStatic(u)) }
      })
      .filter((e) => e.urls.length > 0)

    if (finishExecutions.length >= 2) {
      finishExecutions = sortFinishExecutions(finishExecutions, handle).executions
      finishExecutions = sortCountryFinishExecutionsMilkFirst(finishExecutions)
    } else {
      finishExecutions = []
    }

    const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
    if (seed?.medusa_category_handle) meta.category_handle = seed.medusa_category_handle
    if (seed?.canonical_name) meta.canonical_name = seed.canonical_name
    if (seed?.workbook_row_key) meta.workbook_row_key = seed.workbook_row_key
    meta.country_assignment_v2_applied_at = new Date().toISOString()
    meta.country_assignment_v2_gated_apply = true
    if (finishExecutions.length >= 2) {
      meta.finish_color_labels = labels
      meta.finish_color_executions = finishExecutions
      meta.finish_metadata_source = "country_assignment_v2_gated"
      meta.default_finish_key = activeKey
      syncCountryPaintFinishMetadata(meta)
    } else {
      meta.paint_finish_executions = null
      meta.paint_finish_labels = null
    }

    if (dryRun) {
      logger.info(
        `[DRY-RUN] ${handle}: thumb + ${galleryUrls.length} images, ${finishExecutions.length} finish variants, active=${activeKey}`
      )
      touched.push(handle)
      continue
    }

    await productModule.updateProducts(product.id, {
      thumbnail,
      images: toMedusaImages(galleryUrls),
      metadata: meta,
    })
    updated++
    touched.push(handle)
    logger.info(
      `Updated ${handle}: thumb + ${galleryUrls.length} images, ${finishExecutions.length} finish colors`
    )
  }

  const reportPath = path.join(
    root,
    "tmp/country-assignment-v2-2026-06-23/apply-report.json"
  )
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        applied_at: new Date().toISOString(),
        dry_run: dryRun,
        collection: COLLECTION,
        whitelist_count: WHITELIST.size,
        updated,
        skipped,
        missing_file_refs: missingFile,
        touched_handles: touched,
      },
      null,
      2
    )}\n`
  )

  if (dryRun) {
    logger.info(`[DRY-RUN] complete; touched ${touched.length}; missing files: ${missingFile}`)
    return
  }
  logger.info(`Country assignment_v2 gated apply: ${updated} updated, ${skipped} skipped`)
}
