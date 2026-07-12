import type { AdminProductPayload } from "./types.ts"
import {
  displayMediaLabel,
  guessFormatFromUrl,
  mediaUrlIdentityKey,
  toRelativeMediaPath,
} from "./media-url.ts"

export type GalleryFilterId =
  | "all"
  | "main"
  | "duplicates"
  | "broken"
  | "no_tech"

export type GalleryCard = {
  image_id: string | null
  url: string
  relative_url: string
  position: number
  is_thumbnail: boolean
  label: string
  format: string
  identity_key: string
  exact_duplicate: boolean
  load_status: "unknown" | "ok" | "broken"
  missing_id: boolean
  empty_url: boolean
}

export type GalleryView = {
  thumbnail_url: string | null
  thumbnail_outside_images: boolean
  image_count: number
  cards: GalleryCard[]
  exact_duplicate_count: number
  missing_id_count: number
  empty_url_count: number
  warnings: string[]
  status_label: string
  fingerprint: string
  stock_admin_path: string
}

export function mediaFingerprint(
  product: Pick<AdminProductPayload, "updated_at" | "thumbnail" | "images">
): string {
  const imgs = (product.images ?? [])
    .map((i) => `${i?.id ?? ""}|${mediaUrlIdentityKey(i?.url ?? "")}`)
    .join(";")
  return `${product.updated_at ?? ""}::${product.thumbnail ?? ""}::${imgs}`
}

export function buildGalleryView(args: {
  product: Pick<
    AdminProductPayload,
    "id" | "updated_at" | "thumbnail" | "images"
  >
  stockAdminPath: (id: string) => string
}): GalleryView {
  const { product, stockAdminPath } = args
  const thumb =
    typeof product.thumbnail === "string" && product.thumbnail.trim()
      ? product.thumbnail.trim()
      : null
  const thumbKey = thumb ? mediaUrlIdentityKey(thumb) : null

  const raw = product.images ?? []
  const keyCounts = new Map<string, number>()
  for (const img of raw) {
    const key = mediaUrlIdentityKey(img?.url ?? "")
    if (!key) continue
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }

  const cards: GalleryCard[] = raw.map((img, index) => {
    const url = typeof img?.url === "string" ? img.url.trim() : ""
    const key = mediaUrlIdentityKey(url)
    const empty_url = !url
    const missing_id = !img?.id
    return {
      image_id: img?.id ?? null,
      url,
      relative_url: toRelativeMediaPath(url),
      position: index + 1,
      is_thumbnail: Boolean(thumbKey && key && key === thumbKey),
      label: empty_url ? "(пустой URL)" : displayMediaLabel(url),
      format: empty_url ? "—" : guessFormatFromUrl(url),
      identity_key: key,
      exact_duplicate: Boolean(key && (keyCounts.get(key) ?? 0) > 1),
      load_status: "unknown",
      missing_id,
      empty_url,
    }
  })

  const thumbInImages = Boolean(
    thumbKey && cards.some((c) => c.identity_key === thumbKey)
  )

  const warnings: string[] = []
  if (!thumb) warnings.push("Нет главного фото (thumbnail).")
  if (cards.length === 0) warnings.push("Галерея пуста.")
  if (thumb && !thumbInImages) {
    warnings.push(
      "Главное фото задано URL-ом вне списка product.images — это допустимо."
    )
  }
  const exact_duplicate_count = cards.filter((c) => c.exact_duplicate).length
  if (exact_duplicate_count) {
    warnings.push(`Точные дубли URL: ${exact_duplicate_count} кадров.`)
  }
  const missing_id_count = cards.filter((c) => c.missing_id).length
  const empty_url_count = cards.filter((c) => c.empty_url).length
  if (missing_id_count) warnings.push(`Без ID: ${missing_id_count}.`)
  if (empty_url_count) warnings.push(`Пустой URL: ${empty_url_count}.`)

  let status_label = "Галерея в порядке"
  if (!thumb || cards.length === 0 || exact_duplicate_count || empty_url_count) {
    status_label = "Требует внимания"
  }

  return {
    thumbnail_url: thumb,
    thumbnail_outside_images: Boolean(thumb && !thumbInImages),
    image_count: cards.length,
    cards,
    exact_duplicate_count,
    missing_id_count,
    empty_url_count,
    warnings,
    status_label,
    fingerprint: mediaFingerprint(product),
    stock_admin_path: stockAdminPath(product.id!),
  }
}

export function filterGalleryCards(
  cards: GalleryCard[],
  filter: GalleryFilterId,
  query: string
): GalleryCard[] {
  const q = query.trim().toLowerCase()
  let list = cards
  if (filter === "main") list = list.filter((c) => c.is_thumbnail)
  else if (filter === "duplicates") list = list.filter((c) => c.exact_duplicate)
  else if (filter === "broken") list = list.filter((c) => c.load_status === "broken")
  else if (filter === "no_tech") {
    list = list.filter((c) => c.missing_id || c.empty_url)
  }
  if (!q) return list
  return list.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.url.toLowerCase().includes(q) ||
      (c.image_id ?? "").toLowerCase().includes(q)
  )
}

export type ImagesPayloadItem = { id?: string; url: string }

export function buildImagesReplacementPayload(args: {
  snapshot: Array<{ id?: string | null; url?: string | null }>
  nextOrderedIds: string[]
}):
  | { ok: true; images: ImagesPayloadItem[] }
  | {
      ok: false
      code: "empty" | "missing_id" | "unknown_id" | "incomplete" | "snapshot_invalid"
    } {
  if (args.nextOrderedIds.length === 0) return { ok: false, code: "empty" }
  const snap = args.snapshot ?? []
  if (snap.some((i) => !i?.id || !String(i.url ?? "").trim())) {
    return { ok: false, code: "snapshot_invalid" }
  }
  const byId = new Map<string, { id: string; url: string }>()
  for (const img of snap) {
    byId.set(img.id!, {
      id: img.id!,
      url: toRelativeMediaPath(img.url!) || img.url!.trim(),
    })
  }
  if (byId.size !== snap.length) return { ok: false, code: "incomplete" }
  const images: ImagesPayloadItem[] = []
  for (const id of args.nextOrderedIds) {
    const row = byId.get(id)
    if (!row) return { ok: false, code: "unknown_id" }
    images.push({ id: row.id, url: row.url })
  }
  // Reorder must keep the same membership as snapshot
  if (images.length !== snap.length) return { ok: false, code: "incomplete" }
  if (new Set(args.nextOrderedIds).size !== args.nextOrderedIds.length) {
    return { ok: false, code: "incomplete" }
  }
  return { ok: true, images }
}

export function buildUnlinkPayload(args: {
  snapshot: Array<{ id?: string | null; url?: string | null }>
  removeId: string
}):
  | { ok: true; images: ImagesPayloadItem[]; nextThumbnailUrl: string | null; removedWasThumb: boolean }
  | { ok: false; code: "empty" | "not_found" | "last_image" | "snapshot_invalid" } {
  const snap = args.snapshot ?? []
  if (snap.some((i) => !i?.id || !String(i.url ?? "").trim())) {
    return { ok: false, code: "snapshot_invalid" }
  }
  const removeIdx = snap.findIndex((i) => i?.id === args.removeId)
  if (removeIdx < 0) return { ok: false, code: "not_found" }
  if (snap.length <= 1) return { ok: false, code: "last_image" }
  const kept = snap.filter((i) => i!.id !== args.removeId)
  const images = kept.map((i) => ({
    id: i.id!,
    url: toRelativeMediaPath(i.url!) || i.url!.trim(),
  }))
  // Prefer the image that was next after the removed one; else previous.
  const nextIdx = Math.min(removeIdx, kept.length - 1)
  const nextThumbnailUrl =
    toRelativeMediaPath(kept[nextIdx]?.url ?? "") || kept[nextIdx]?.url?.trim() || null
  return {
    ok: true,
    images,
    nextThumbnailUrl,
    removedWasThumb: false, // caller sets using thumb compare
  }
}

export function buildAttachPayload(args: {
  snapshot: Array<{ id?: string | null; url?: string | null }>
  newUrls: string[]
}):
  | { ok: true; images: ImagesPayloadItem[] }
  | { ok: false; code: "no_urls" | "snapshot_invalid" } {
  const urls = args.newUrls.map((u) => toRelativeMediaPath(u) || u.trim()).filter(Boolean)
  if (!urls.length) return { ok: false, code: "no_urls" }
  const snap = args.snapshot ?? []
  if (snap.some((i) => !i?.id || !String(i.url ?? "").trim())) {
    return { ok: false, code: "snapshot_invalid" }
  }
  const existing = snap.map((i) => ({
    id: i.id!,
    url: toRelativeMediaPath(i.url!) || i.url!.trim(),
  }))
  return {
    ok: true,
    images: [...existing, ...urls.map((url) => ({ url }))],
  }
}

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function validateUploadFile(file: {
  name: string
  type: string
  size: number
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!file || file.size <= 0) {
    return { ok: false, code: "empty_file", message: "Файл пустой." }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "oversized_file",
      message: "Файл больше 8 МБ.",
    }
  }
  const type = (file.type || "").toLowerCase()
  if (type && !ALLOWED.has(type)) {
    return {
      ok: false,
      code: "unsupported_file",
      message: "Поддерживаются JPG, PNG, WEBP, GIF.",
    }
  }
  if (!type) {
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      return {
        ok: false,
        code: "unsupported_file",
        message: "Поддерживаются JPG, PNG, WEBP, GIF.",
      }
    }
  }
  return { ok: true }
}

export function moveId(
  ids: string[],
  id: string,
  action: "up" | "down" | "start" | "end" | number
): string[] {
  const next = [...ids]
  const i = next.indexOf(id)
  if (i < 0) return next
  next.splice(i, 1)
  let target = i
  if (action === "up") target = Math.max(0, i - 1)
  else if (action === "down") target = Math.min(next.length, i + 1)
  else if (action === "start") target = 0
  else if (action === "end") target = next.length
  else target = Math.max(0, Math.min(next.length, action))
  next.splice(target, 0, id)
  return next
}
