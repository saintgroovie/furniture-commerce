/**
 * Immutable RoomSet V1 owner-approved manifest + deterministic SHA.
 * Content must match docs/operator contract; do not add timestamps.
 */
import { createHash } from "node:crypto"

export const ROOMSET_V1_MANIFEST_ID = "rooms-v1-owner-approved" as const

/** Historical seed slugs — must never be reactivated or reused by this script. */
export const FORBIDDEN_HISTORICAL_SLUGS = [
  "detskaya-pervenets",
  "detskaya-shkolnika",
  "kabinet",
  "spalnya",
  "gostinaya",
] as const

/**
 * Create order: Cloud first, Greenwich second.
 * Store API lists active RoomSets by created_at DESC → Greenwich then Cloud.
 */
export const ROOMS_V1_CREATE_ORDER = ["spalnya-cloud", "spalnya-greenwich"] as const

export const ROOMS_V1_BUYER_CARD_ORDER = [
  "spalnya-greenwich",
  "spalnya-cloud",
] as const

export type RoomsV1Spec = {
  slug: string
  title: string
  room_type: string
  style: string
  hero_image: string
  /** Buyer card order (1 = first). Enforced via create order, not a DB column. */
  page_order: number
  product_handles: string[]
}

/** Owner-approved product order (exact). */
export const ROOMS_V1_SPECS: RoomsV1Spec[] = [
  {
    slug: "spalnya-cloud",
    title: "Спальня Cloud",
    room_type: "спальня",
    style: "Greenwich",
    hero_image:
      "/product-static/products/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg",
    page_order: 2,
    product_handles: [
      "greenwich-gr-12-1",
      "greenwich-gr-67-1",
      "greenwich-gr-02-1",
    ],
  },
  {
    slug: "spalnya-greenwich",
    title: "Спальня Greenwich",
    room_type: "спальня",
    style: "Greenwich",
    hero_image:
      "/product-static/products/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View01.jpg",
    page_order: 1,
    product_handles: [
      "greenwich-gr-12-1",
      "greenwich-gr-08-1",
      "greenwich-gr-67-1",
    ],
  },
]

/** Canonical hash payload (sorted keys at serialize time). */
export function roomsV1ManifestPayload(): Record<string, unknown> {
  return {
    manifest_id: ROOMSET_V1_MANIFEST_ID,
    oliver: "DEFERRED",
    forbidden_historical_slugs: [...FORBIDDEN_HISTORICAL_SLUGS],
    create_order: [...ROOMS_V1_CREATE_ORDER],
    buyer_card_order: [...ROOMS_V1_BUYER_CARD_ORDER],
    rooms: ROOMS_V1_SPECS.map((s) => ({
      slug: s.slug,
      title: s.title,
      room_type: s.room_type,
      style: s.style,
      hero_image: s.hero_image,
      page_order: s.page_order,
      product_handles: [...s.product_handles],
    })),
  }
}

/**
 * Stable recursive encoder matching Python
 * json.dumps(..., sort_keys=True, separators=(',', ':'), ensure_ascii=False).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`
}

export function computeRoomsV1ManifestSha(
  payload: Record<string, unknown> = roomsV1ManifestPayload()
): string {
  const raw = stableStringify(payload)
  return createHash("sha256").update(raw, "utf8").digest("hex")
}

/** Pinned expected SHA — must match evidence MANIFEST-CONTRACT. */
export const ROOMSET_V1_MANIFEST_SHA_EXPECTED =
  "71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e"
