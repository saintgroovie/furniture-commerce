import fs from "node:fs"
import path from "node:path"
import { extractStaticProductPath } from "../oliver-static-url"

export type ExecutionVariantSummary = {
  key: string
  label?: string
  main?: string
  gallery_count: number
  roles?: string[]
}

type ColorExecution = {
  key?: string
  label?: string
  urls?: string[]
  main?: string
  roles?: string[]
}

function normalizeImageUrl(entry: unknown): string | null {
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (entry && typeof entry === "object" && "url" in entry) {
    const u = (entry as { url?: unknown }).url
    if (typeof u === "string") {
      const s = u.trim()
      return s.length > 0 ? s : null
    }
  }
  return null
}

export function collectProductImageUrls(product: Record<string, unknown>): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  const push = (raw: string | null) => {
    if (!raw || seen.has(raw)) return
    seen.add(raw)
    urls.push(raw)
  }

  const thumb = product.thumbnail
  if (typeof thumb === "string") push(thumb.trim() || null)

  const images = product.images
  if (Array.isArray(images)) {
    for (const img of images) push(normalizeImageUrl(img))
  }

  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  if (Array.isArray(meta.images)) {
    for (const img of meta.images) push(normalizeImageUrl(img))
  }

  return urls
}

export function parseExecutionVariants(
  product: Record<string, unknown>
): ExecutionVariantSummary[] {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const labels = (meta.finish_color_labels as Record<string, string> | undefined) ?? {}
  const raw =
    meta.finish_color_executions ?? meta.paint_finish_executions ?? meta.display_group_color_variants

  if (!Array.isArray(raw)) return []

  const out: ExecutionVariantSummary[] = []
  for (const item of raw as ColorExecution[]) {
    if (!item || typeof item !== "object") continue
    const key = typeof item.key === "string" ? item.key : ""
    if (!key) continue
    const urls = Array.isArray(item.urls) ? item.urls.filter((u) => typeof u === "string") : []
    const main =
      typeof item.main === "string"
        ? item.main
        : urls[0]
    out.push({
      key,
      label: item.label ?? labels[key] ?? key,
      main,
      gallery_count: urls.length,
      roles: Array.isArray(item.roles) ? item.roles.map(String) : undefined,
    })
  }
  return out
}

export type SellerMediaPartition = {
  general_image_urls: string[]
  execution_photo_count: number
  execution_finishes: Array<{ key: string; label: string; photo_count: number }>
}

function collectExecutionUrlSet(product: Record<string, unknown>): Set<string> {
  const urls = new Set<string>()
  const variants = parseExecutionVariants(product)
  for (const variant of variants) {
    if (variant.main) urls.add(variant.main)
  }
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const raw =
    meta.finish_color_executions ?? meta.paint_finish_executions ?? meta.display_group_color_variants
  if (!Array.isArray(raw)) return urls
  for (const item of raw as ColorExecution[]) {
    if (!item || typeof item !== "object") continue
    if (typeof item.main === "string" && item.main.trim()) urls.add(item.main)
    if (!Array.isArray(item.urls)) continue
    for (const url of item.urls) {
      if (typeof url === "string" && url.trim()) urls.add(url)
    }
  }
  return urls
}

export function partitionSellerMedia(
  imageUrls: string[],
  product: Record<string, unknown>
): SellerMediaPartition {
  const executionUrls = collectExecutionUrlSet(product)
  const general_image_urls = imageUrls.filter((url) => !executionUrls.has(url))
  const finishes = parseExecutionVariants(product).map((variant) => ({
    key: variant.key,
    label: variant.label ?? variant.key,
    photo_count: variant.gallery_count,
  }))
  return {
    general_image_urls,
    execution_photo_count: executionUrls.size,
    execution_finishes: finishes,
  }
}

export function checkStaticMediaPaths(
  urls: string[],
  backendRoot: string
): { missing: string[]; broken: string[] } {
  const missing: string[] = []
  const broken: string[] = []

  for (const url of urls) {
    const staticPath = extractStaticProductPath(url)
    if (!staticPath.startsWith("/static/products/")) continue
    const diskPath = path.join(backendRoot, staticPath.replace(/^\//, ""))
    if (!fs.existsSync(diskPath)) {
      missing.push(url)
    }
  }

  for (const url of urls) {
    if (!url || url.trim() === "") {
      broken.push(url || "(empty)")
    }
  }

  return { missing, broken }
}
