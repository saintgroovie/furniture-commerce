import fs from "node:fs"
import path from "node:path"
import { extractStaticProductPath } from "../oliver-static-url"
import { EXECUTION_ARRAY_KEYS } from "./execution-media-guard"

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

function executionRecordsFromValue(raw: unknown, depth = 0): ColorExecution[] {
  if (depth > 3 || raw == null) return []
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => executionRecordsFromValue(item, depth + 1))
  }
  if (typeof raw !== "object") return []
  const item = raw as ColorExecution & Record<string, unknown>
  const self: ColorExecution[] = []
  if (
    typeof item.key === "string" ||
    typeof item.main === "string" ||
    Array.isArray(item.urls)
  ) {
    self.push(item)
  }
  const nested = Object.values(item).flatMap((value) => {
    if (!Array.isArray(value)) return []
    const looksLikeExecutions = value.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        ("urls" in entry || "main" in entry || "key" in entry)
    )
    return looksLikeExecutions ? executionRecordsFromValue(value, depth + 1) : []
  })
  return [...self, ...nested]
}

export function parseExecutionVariants(
  product: Record<string, unknown>
): ExecutionVariantSummary[] {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const labels = (meta.finish_color_labels as Record<string, string> | undefined) ?? {}
  const records = [
    ...EXECUTION_ARRAY_KEYS.flatMap((key) => executionRecordsFromValue(meta[key])),
    ...executionRecordsFromValue(meta.display_group_color_variants),
  ]

  const out: ExecutionVariantSummary[] = []
  const seen = new Set<string>()
  for (const item of records) {
    const urls = Array.isArray(item.urls) ? item.urls.filter((u) => typeof u === "string") : []
    const key =
      typeof item.key === "string" && item.key
        ? item.key
        : typeof item.main === "string"
          ? item.main
          : urls[0] ?? ""
    if (!key || seen.has(key)) continue
    seen.add(key)
    const main = typeof item.main === "string" ? item.main : urls[0]
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
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const records = [
    ...EXECUTION_ARRAY_KEYS.flatMap((key) => executionRecordsFromValue(meta[key])),
    ...executionRecordsFromValue(meta.display_group_color_variants),
  ]
  for (const item of records) {
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
