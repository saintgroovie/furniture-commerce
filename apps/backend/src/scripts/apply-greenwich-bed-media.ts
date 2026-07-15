/**
 * Apply Greenwich bed GR-BED-POOL + headboard_model_executions to all greenwich-bed SKUs.
 *
 * Dry-run:
 *   GW_BED_MEDIA_DRY_RUN=1 GW_BED_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-bed-media.ts
 *
 * Apply:
 *   GW_BED_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-bed-media.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  pickBuyerThumbnail,
  sortUrlsByBuyerPolicy,
  toMedusaImages,
} from "../lib/gallery-buyer-sort"
import { buildGreenwichBedDimensionBundle } from "../lib/greenwich-bed-dimension-metadata"
import { DIMENSION_METADATA_VERSION } from "../lib/gallery-dimension-metadata"

const MANIFEST_REL = "tmp/greenwich-bed-headboard-import/manifests/greenwich-bed-pool.json"

/**
 * Fail-closed owner-approved apply scope. Manifest handles must equal this set
 * exactly (same members; order may differ). Extra/missing handles abort apply.
 */
const APPROVED_GREENWICH_BED_HANDLES = [
  "greenwich-gr-09-1-bed-90",
  "greenwich-gr-12-1",
  "greenwich-gr-14-1",
  "greenwich-gr-16-1",
  "greenwich-gr-18-1",
] as const

const EXPECTED_MATRIX_CELLS = 11

type HeadboardExecution = { key: string; label: string; urls: string[] }

type ColorExecution = { key: string; label: string; urls: string[] }

type Manifest = {
  display_group?: string
  handles: string[]
  headboard_model_executions: HeadboardExecution[]
  upholstery_color_labels?: Record<string, string>
  upholstery_color_executions?: ColorExecution[]
  thumbnail_url: string
  gallery_urls: string[]
}

const BED_UPHOLSTERY_LABELS: Record<string, string> = {
  natural_beige: "Natural / Beige",
  dark_beige: "Dark / Beige",
  natural_darkblue: "Natural / Dark blue",
  dark_darkblue: "Dark / Dark blue",
}

function extractBedUpholsteryToken(filename: string): string | null {
  const m = filename.match(/(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/i)
  return m ? m[1].toLowerCase() : null
}

function buildUpholsteryExecutionsFromGallery(
  galleryUrls: string[]
): { labels: Record<string, string>; executions: ColorExecution[] } {
  const byToken = new Map<string, string[]>()
  for (const rel of galleryUrls) {
    const base = rel.split("/").pop() ?? rel
    const token = extractBedUpholsteryToken(base)
    if (!token) continue
    const arr = byToken.get(token) ?? []
    arr.push(rel)
    byToken.set(token, arr)
  }
  const order = ["natural_beige", "dark_beige", "natural_darkblue", "dark_darkblue"]
  const executions: ColorExecution[] = []
  const labels: Record<string, string> = {}
  for (const token of order) {
    const urls = byToken.get(token)
    if (!urls?.length) continue
    const label = BED_UPHOLSTERY_LABELS[token] ?? token
    labels[token] = label
    executions.push({ key: token, label, urls: [urls[0]!] })
  }
  return { labels, executions }
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

function absUrl(base: string, publicUrl: string): string {
  const p = publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}`
  return `${base}${p}`
}

function loadAndValidateManifest(root: string): { manifestPath: string; manifest: Manifest } {
  const manifestPath = path.join(root, MANIFEST_REL)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Missing manifest: ${MANIFEST_REL}. Run fetch-greenwich-bed-headboard.mjs first.`
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  } catch {
    throw new Error(`Invalid JSON in manifest: ${MANIFEST_REL}`)
  }

  const manifest = raw as Manifest
  if (!Array.isArray(manifest.handles) || manifest.handles.length === 0) {
    throw new Error(`Manifest ${MANIFEST_REL}: handles[] must be non-empty`)
  }
  if (
    !Array.isArray(manifest.headboard_model_executions) ||
    manifest.headboard_model_executions.length < 2
  ) {
    throw new Error(
      `Manifest ${MANIFEST_REL}: headboard_model_executions must have at least 2 entries`
    )
  }
  for (const entry of manifest.headboard_model_executions) {
    if (!entry?.key?.trim() || !entry?.label?.trim()) {
      throw new Error(`Manifest ${MANIFEST_REL}: each headboard execution needs key + label`)
    }
    if (!Array.isArray(entry.urls) || entry.urls.length === 0) {
      throw new Error(
        `Manifest ${MANIFEST_REL}: headboard "${entry.key}" must have at least one url`
      )
    }
  }
  if (typeof manifest.thumbnail_url !== "string" || !manifest.thumbnail_url.trim()) {
    throw new Error(`Manifest ${MANIFEST_REL}: thumbnail_url is required`)
  }
  if (!Array.isArray(manifest.gallery_urls) || manifest.gallery_urls.length === 0) {
    throw new Error(`Manifest ${MANIFEST_REL}: gallery_urls[] must be non-empty`)
  }

  const approved = new Set<string>(APPROVED_GREENWICH_BED_HANDLES)
  const declared = [...new Set(manifest.handles.map((h) => h.trim()).filter(Boolean))]
  const extra = declared.filter((h) => !approved.has(h))
  const missing = APPROVED_GREENWICH_BED_HANDLES.filter((h) => !declared.includes(h))
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `Manifest handle scope mismatch vs APPROVED_GREENWICH_BED_HANDLES. ` +
        `extra=[${extra.join(", ")}] missing=[${missing.join(", ")}]`
    )
  }
  if (
    manifest.display_group != null &&
    manifest.display_group !== "greenwich-bed"
  ) {
    throw new Error(
      `Manifest display_group must be "greenwich-bed" (got ${String(manifest.display_group)})`
    )
  }

  for (const rel of manifest.gallery_urls) {
    const disk = path.join(root, "apps/backend", rel.replace(/^\//, ""))
    if (!fs.existsSync(disk)) {
      throw new Error(`Missing static file: ${rel}`)
    }
  }

  return { manifestPath, manifest }
}

export default async function applyGreenwichBedMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.GW_BED_MEDIA_DRY_RUN === "1"

  if (process.env.GW_BED_MEDIA_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_BED_MEDIA_CONFIRM=1")
    return
  }

  const root = repoRoot()
  const { manifestPath, manifest } = loadAndValidateManifest(root)

  const base = backendBaseUrl(root)
  const galleryRelSorted = sortUrlsByBuyerPolicy(manifest.gallery_urls, { handle: "greenwich-bed" })
  const bundle = buildGreenwichBedDimensionBundle(galleryRelSorted)
  const thumbnailUrl = absUrl(base, bundle.thumbnail_url)
  const galleryUrls = bundle.gallery_urls.map((u) => absUrl(base, u))

  const productModule = container.resolve(Modules.PRODUCT)

  if (bundle.bed_execution_matrix.length !== EXPECTED_MATRIX_CELLS) {
    throw new Error(
      `Builder produced ${bundle.bed_execution_matrix.length} matrix cells; expected ${EXPECTED_MATRIX_CELLS}`
    )
  }

  /* Preflight: resolve all five products and scope guards before any write. */
  type Target = {
    handle: string
    id: string
    product: {
      id: string
      handle?: string | null
      metadata?: Record<string, unknown> | null
    }
  }
  const targets: Target[] = []
  const missingHandles: string[] = []

  for (const handle of APPROVED_GREENWICH_BED_HANDLES) {
    const listed = await productModule.listProducts(
      { handle },
      { take: 1, relations: ["images", "variants"] }
    )
    const product = listed?.[0]
    if (!product?.id) {
      missingHandles.push(handle)
      continue
    }
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    if (
      meta.display_group != null &&
      meta.display_group !== "greenwich-bed" &&
      meta.display_group !== (manifest.display_group ?? "greenwich-bed")
    ) {
      throw new Error(
        `Refusing ${handle}: display_group=${String(meta.display_group)}`
      )
    }
    targets.push({ handle, id: product.id, product })
  }

  if (missingHandles.length > 0) {
    throw new Error(
      `Missing products for approved handles: ${missingHandles.join(", ")}`
    )
  }
  if (targets.length !== APPROVED_GREENWICH_BED_HANDLES.length) {
    throw new Error(
      `Preflight incomplete: resolved ${targets.length}/${APPROVED_GREENWICH_BED_HANDLES.length}`
    )
  }

  if (dryRun) {
    logger.info(
      `[DRY-RUN] Would update ${targets.length} bed SKU(s) from ${manifestPath}: matrix=${bundle.bed_execution_matrix.length}, gallery=${galleryUrls.length} — ${targets.map((t) => t.handle).join(", ")}`
    )
    return
  }

  for (const target of targets) {
    const meta = { ...(target.product.metadata ?? {}) } as Record<string, unknown>
    meta.display_group = manifest.display_group ?? "greenwich-bed"
    meta.headboard_model_labels = bundle.headboard_model_labels
    meta.headboard_model_executions = bundle.headboard_model_executions
    meta.frame_material_labels = bundle.frame_material_labels
    meta.frame_material_executions = bundle.frame_material_executions
    meta.fabric_upholstery_labels = bundle.fabric_upholstery_labels
    meta.fabric_upholstery_executions = bundle.fabric_upholstery_executions
    meta.upholstery_color_labels = bundle.fabric_upholstery_labels
    meta.upholstery_color_executions = bundle.fabric_upholstery_executions
    meta.bed_execution_matrix = bundle.bed_execution_matrix
    if (bundle.shared_scene_media.length > 0) {
      meta.shared_scene_media = bundle.shared_scene_media
    }
    meta.dimension_metadata_version = DIMENSION_METADATA_VERSION
    meta.execution_dimension_contract =
      "headboard_model|frame_material|fabric_upholstery|bed_execution_matrix|shared_scene"
    meta.greenwich_bed_metadata_source = "gr-bed-pool-v2"
    delete meta.finish_color_executions
    delete meta.finish_color_labels
    delete meta.paint_finish_executions
    delete meta.paint_finish_labels

    await productModule.updateProducts(target.id, {
      thumbnail: thumbnailUrl,
      images: toMedusaImages(galleryUrls, target.handle),
      metadata: meta,
    })
    logger.info(
      `Updated ${target.handle}: matrix=${bundle.bed_execution_matrix.length} cells, thumb=${bundle.thumbnail_url.split("/").pop()}`
    )
  }
}
