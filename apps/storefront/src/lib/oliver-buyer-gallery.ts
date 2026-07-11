/**
 * Browser-safe Oliver gallery helpers + shared collectors (no Node fs/crypto).
 * MD5 workbook repair: apps/backend/src/lib/gallery-content-dedupe.ts (apply scripts only).
 * PDP render repair: apps/storefront/src/lib/pdp-buyer-gallery.server.ts (server-only).
 */
import { collectProductImageUrls } from "./collect-product-image-urls"
import {
  collapseBuyerGalleryUrls,
  sortUrlsByBuyerPolicy,
} from "../../../backend/src/lib/gallery-buyer-sort"
import {
  isOliverFalseFinishColorSplit,
} from "./oliver-finish-execution-guard"

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function normalizeImageEntryUrl(entry: unknown): string | null {
  if (entry == null) return null
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (typeof entry !== "object") return null
  const o = entry as Record<string, unknown>
  const direct = o.url ?? o.URL ?? o.src
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  return null
}

function findGallerySlot(urls: string[], slot: "03" | "04" | "05"): string | undefined {
  const re = new RegExp(`gallery[_\\-.]?${slot}(?:\\.|[-_]|$)`, "i")
  return urls.find((u) => re.test(basenameKey(u)))
}

function inferSiblingGallerySlotUrl(url: string, slot: "05" | "06"): string | null {
  const base = url.split("/").pop()
  if (!base) return null
  const sibling = base.replace(/gallery[_\-.]?03/i, `gallery_${slot}`)
  if (sibling === base) return null
  const prefix = url.slice(0, url.length - base.length)
  return `${prefix}${sibling}`
}

function dedupeUrlsByBasename(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    const key = basenameKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(url)
  }
  return out
}

/** Use persisted Medusa operator_role when present (post-apply source of truth). */
export function roleByUrlFromProductImages(product: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>()
  const raw = product.images
  const list: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const url = normalizeImageEntryUrl(entry)
    const role = (entry as Record<string, unknown>).metadata as Record<string, unknown> | undefined
    const op = role?.operator_role
    if (url && typeof op === "string" && op.trim()) map.set(url.trim(), op.trim())
  }
  return map
}

export function operatorRoleForProductImageUrl(
  product: Record<string, unknown>,
  url: string
): string | null {
  const map = roleByUrlFromProductImages(product)
  const direct = map.get(url.trim())
  if (direct) return direct
  const key = basenameKey(url)
  for (const [storedUrl, role] of map) {
    if (basenameKey(storedUrl) === key) return role
  }
  return null
}

function buildOliverWorkbookTailRoleOverrides(
  urls: string[],
  storedRoles: Map<string, string>
): Map<string, string> {
  const roleByUrl = new Map<string, string>()
  const g03 = findGallerySlot(urls, "03")
  const g04 = findGallerySlot(urls, "04")
  if (!g03 || !g04) return roleByUrl

  const g05 = findGallerySlot(urls, "05") ?? inferSiblingGallerySlotUrl(g03, "05")
  if (g05 && basenameKey(g03) === basenameKey(g05)) {
    roleByUrl.set(g04, "scheme")
    return roleByUrl
  }

  const g04StoredScheme = [...storedRoles.entries()].some(
    ([url, role]) => /gallery[_\-.]?04/i.test(basenameKey(url)) && role === "scheme"
  )
  const g05Slot = findGallerySlot(urls, "05")
  const g05StoredInterior =
    g05Slot != null &&
    [...storedRoles.entries()].some(
      ([url, role]) =>
        basenameKey(url) === basenameKey(g05Slot) && role === "interior"
    )
  if (g04StoredScheme && g05Slot) {
    roleByUrl.set(g04, "scheme")
    roleByUrl.set(g05Slot, "interior")
  } else if (g04StoredScheme && g05StoredInterior) {
    roleByUrl.set(g04, "scheme")
    roleByUrl.set(g05Slot!, "interior")
  } else if (g04StoredScheme) {
    roleByUrl.set(g04, "scheme")
  }

  for (const [url, role] of storedRoles) {
    if (!roleByUrl.has(url)) roleByUrl.set(url, role)
  }
  return roleByUrl
}

function dropLegacyWorkbookSemanticPairDuplicates(urls: string[]): string[] {
  let out = urls
  const base = (url: string) => basenameKey(url)

  const dropPair = (legacyRe: RegExp, galleryRe: RegExp, dropLegacy: boolean) => {
    const legacy = out.find((u) => legacyRe.test(base(u)))
    const gallery = out.find((u) => galleryRe.test(base(u)))
    if (!legacy || !gallery || legacy === gallery) return
    const victim = dropLegacy ? legacy : gallery
    out = out.filter((u) => u !== victim)
  }

  dropPair(/[-_]i0?2(?:\.|[-_]|$)/i, /gallery[_\-.]?02/i, false)
  dropPair(/[-_]i0?1(?:\.|[-_]|$)/i, /gallery[_\-.]?01/i, true)
  return out
}

function prepBase(urls: string[], product: Record<string, unknown>): {
  urls: string[]
  roleByUrl: Map<string, string>
} {
  const storedRoles = roleByUrlFromProductImages(product)
  const roleByUrl = buildOliverWorkbookTailRoleOverrides(urls, storedRoles)
  let deduped = dedupeUrlsByBasename(urls)
  deduped = dropLegacyWorkbookSemanticPairDuplicates(deduped)
  return { urls: deduped, roleByUrl }
}

export { collectProductImageUrls } from "./collect-product-image-urls"

export function prepareOliverBuyerGalleryLite(
  product: Record<string, unknown>,
  handle: string
): string[] {
  const raw = collectProductImageUrls(product)
  const { urls: prepped, roleByUrl } = prepBase(raw, product)
  return collapseBuyerGalleryUrls(prepped, { handle, roleByUrl })
}

export function prepareOliverBuyerGalleryHashOnlyLite(
  product: Record<string, unknown>,
  handle: string
): string[] {
  const raw = collectProductImageUrls(product)
  const { urls: prepped, roleByUrl } = prepBase(raw, product)
  return sortUrlsByBuyerPolicy(prepped, { handle, roleByUrl })
}

export function isOliverMultiColorProduct(product: Record<string, unknown>): boolean {
  const handle = typeof product.handle === "string" ? product.handle : undefined
  const meta = product.metadata as Record<string, unknown> | undefined
  const raw = collectProductImageUrls(product)

  const fabricExec = meta?.fabric_upholstery_executions ?? meta?.upholstery_color_executions
  if (Array.isArray(fabricExec) && fabricExec.length >= 2) {
    if (
      isOliverFalseFinishColorSplit(
        raw,
        fabricExec as Array<{ key: string; label: string; urls: string[] }>,
        handle
      )
    ) {
      return false
    }
    return true
  }

  const finishExec = meta?.finish_color_executions
  if (!Array.isArray(finishExec) || finishExec.length < 2) return false
  if (isOliverFalseFinishColorSplit(raw, finishExec as Array<{ key: string; label: string; urls: string[] }>, handle)) {
    return false
  }
  return finishExec.length >= 2
}
