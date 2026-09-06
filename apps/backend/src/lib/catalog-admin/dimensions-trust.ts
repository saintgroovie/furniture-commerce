/**
 * Admin-facing dimensions trust overlay (Dimensions Recovery operational baseline).
 *
 * Static SKU/handle map — NOT a second SoT for mm values.
 * Live H/W/D still come from product metadata via resolveFurnitureDimensions.
 * This module only answers: how confident / actionable is that value for a manager.
 *
 * Maintenance:
 * - File: apps/backend/src/lib/catalog-admin/dimensions-trust.ts
 * - After a new dimensions baseline, add/update BY_SKU (and BY_HANDLE if needed).
 * - Default for unmapped products is UNKNOWN ("Статус не размечен") - never VERIFIED.
 * - Special cases: C1 six TEMPORARY_PENDING; TE/PR-30/OL-08-1-MIR VERIFIED;
 *   PA-62-1 pending owner; PR-06/PW-06/SH-99/MC-99 conflict; S-OX missing.
 *
 * Do not invent fills. Do not imply C1 440 is final canonical truth.
 */

export type DimensionsTrustState =
  | "VERIFIED_CANONICAL"
  | "TEMPORARY_PENDING"
  | "STRONG_CANDIDATE_PENDING_OWNER"
  | "CONFLICT_SOURCE_DEBT"
  | "MISSING_SOURCE_DEBT"
  | "UNKNOWN"

export type DimensionsTrustEntry = {
  state: DimensionsTrustState
  /** Axes with known debt / pending (uppercase H W D). Empty = whole product. */
  axes?: Array<"H" | "W" | "D">
  /** Short RU operator hint — no governance jargon in primary UI. */
  manager_hint_ru: string
  /** Secondary technical note (collapsible). */
  technical_note?: string
  /** Editing dimensions as if verified is unsafe. */
  block_casual_verify_implication: boolean
  /**
   * When set on VERIFIED_CANONICAL, live H/W/D must match or the badge
   * is downgraded. Identity match alone is not verification of current mm.
   */
  verified_mm?: {
    height_mm: number
    width_mm: number
    depth_mm: number
  }
}

/** C1 six — live 1370×650×440 temporary; OD-DIM-02=C not superseded. */
const C1_TEMPORARY: DimensionsTrustEntry = {
  state: "TEMPORARY_PENDING",
  manager_hint_ru:
    "Значение используется на сайте временно. Нужен технический источник для подтверждения глубины",
  technical_note:
    "OD-DIM-05-3-FINAL=C1 · OD-DIM-02=C intact · not VERIFIED_CANONICAL · historical import depth is provenance only",
  block_casual_verify_implication: true,
}

const BY_SKU: Record<string, DimensionsTrustEntry> = {
  "FA-05-3": C1_TEMPORARY,
  "FK-05-3": C1_TEMPORARY,
  "PA-05-3": C1_TEMPORARY,
  "RS-05-3": C1_TEMPORARY,
  "TB-05-3": C1_TEMPORARY,
  "TW-05-3": C1_TEMPORARY,
  "TE-05-1": {
    state: "VERIFIED_CANONICAL",
    manager_hint_ru: "Габариты подтверждены",
    block_casual_verify_implication: false,
    verified_mm: { height_mm: 900, width_mm: 840, depth_mm: 560 },
  },
  "PR-30-1": {
    state: "VERIFIED_CANONICAL",
    manager_hint_ru: "Габариты подтверждены (точное восстановление по SKU)",
    block_casual_verify_implication: false,
    verified_mm: { height_mm: 374, width_mm: 288, depth_mm: 40 },
  },
  "OL-08-1-MIR": {
    state: "VERIFIED_CANONICAL",
    manager_hint_ru: "Габариты подтверждены",
    block_casual_verify_implication: false,
    verified_mm: { height_mm: 1000, width_mm: 650, depth_mm: 30 },
  },
  "PA-62-1": {
    state: "STRONG_CANDIDATE_PENDING_OWNER",
    manager_hint_ru:
      "Габариты совпадают с сильным кандидатом, но identity ещё ждёт подтверждения владельца",
    technical_note: "Candidate legacy pid 952 · not auto-VERIFIED (legacy_id exceptions)",
    block_casual_verify_implication: true,
  },
  "PR-06-1": {
    state: "CONFLICT_SOURCE_DEBT",
    axes: ["H"],
    manager_hint_ru: "Нужен источник: конкурируют две высоты - не угадывайте",
    block_casual_verify_implication: true,
  },
  "PW-06-2": {
    state: "CONFLICT_SOURCE_DEBT",
    axes: ["H"],
    manager_hint_ru: "Нужен источник: конкурируют две высоты - не угадывайте",
    block_casual_verify_implication: true,
  },
  "SH-99-1": {
    state: "CONFLICT_SOURCE_DEBT",
    axes: ["D"],
    manager_hint_ru: "Нужен источник: конкурируют две глубины - не угадывайте",
    block_casual_verify_implication: true,
  },
  "MC-99-1": {
    state: "CONFLICT_SOURCE_DEBT",
    axes: ["D"],
    manager_hint_ru: "Нужен источник: глубина неоднозначна - не угадывайте",
    block_casual_verify_implication: true,
  },
  "S-OX-02": {
    state: "MISSING_SOURCE_DEBT",
    axes: ["H", "W", "D"],
    manager_hint_ru: "Нужен источник: габариты отсутствуют",
    block_casual_verify_implication: true,
  },
  "S-OX-03": {
    state: "MISSING_SOURCE_DEBT",
    axes: ["H", "W", "D"],
    manager_hint_ru: "Нужен источник: габариты отсутствуют",
    block_casual_verify_implication: true,
  },
  "S-OX-05": {
    state: "MISSING_SOURCE_DEBT",
    axes: ["H", "W", "D"],
    manager_hint_ru: "Нужен источник: габариты отсутствуют",
    block_casual_verify_implication: true,
  },
}

const BY_HANDLE: Record<string, DimensionsTrustEntry> = {
  "fa-05-3": C1_TEMPORARY,
  "fk-05-3": C1_TEMPORARY,
  "pa-05-3": C1_TEMPORARY,
  "rs-05-3": C1_TEMPORARY,
  "tb-05-3": C1_TEMPORARY,
  "tw-05-3": C1_TEMPORARY,
  "te-05-1": BY_SKU["TE-05-1"]!,
  "pr-30-1": BY_SKU["PR-30-1"]!,
  "ol-08-1-mirror": BY_SKU["OL-08-1-MIR"]!,
  "ol-08-1-mir": BY_SKU["OL-08-1-MIR"]!,
  "pa-62-1": BY_SKU["PA-62-1"]!,
  "pr-06-1": BY_SKU["PR-06-1"]!,
  "pw-06-2": BY_SKU["PW-06-2"]!,
  "sh-99-1": BY_SKU["SH-99-1"]!,
  "mc-99-1": BY_SKU["MC-99-1"]!,
  "s-ox-02": BY_SKU["S-OX-02"]!,
  "s-ox-03": BY_SKU["S-OX-03"]!,
  "s-ox-05": BY_SKU["S-OX-05"]!,
}

export const DIMENSIONS_TRUST_STATE_LABEL_RU: Record<DimensionsTrustState, string> = {
  VERIFIED_CANONICAL: "Подтверждено",
  TEMPORARY_PENDING: "Временно на сайте",
  STRONG_CANDIDATE_PENDING_OWNER: "Ожидает подтверждения identity",
  CONFLICT_SOURCE_DEBT: "Конфликт источников",
  MISSING_SOURCE_DEBT: "Нужен источник",
  UNKNOWN: "Статус не размечен",
}

export function normalizeAdminSku(sku: string | null | undefined): string | null {
  if (!sku || typeof sku !== "string") return null
  const t = sku.trim().toUpperCase()
  return t.length ? t : null
}

const TRUST_RANK: Record<DimensionsTrustState, number> = {
  CONFLICT_SOURCE_DEBT: 0,
  MISSING_SOURCE_DEBT: 1,
  TEMPORARY_PENDING: 2,
  STRONG_CANDIDATE_PENDING_OWNER: 3,
  UNKNOWN: 4,
  VERIFIED_CANONICAL: 5,
}

function moreRestrictive(
  a: DimensionsTrustEntry,
  b: DimensionsTrustEntry
): DimensionsTrustEntry {
  return TRUST_RANK[a.state] <= TRUST_RANK[b.state] ? a : b
}

const UNKNOWN_TRUST: DimensionsTrustEntry = {
  state: "UNKNOWN",
  manager_hint_ru: "Габариты из карточки товара - без отдельной trust-разметки",
  block_casual_verify_implication: false,
}

/**
 * Lookup trust overlay by SKU and/or handle.
 * If both resolve and disagree, fail closed to the more restrictive state
 * (never prefer VERIFIED over TEMPORARY/CONFLICT/MISSING).
 * Returns UNKNOWN when not in the recovery overlay map — filled dims are not
 * automatically "verified".
 * If a SKU is present but unmapped, do not inherit a mapped handle overlay
 * (avoids marking a random SKU verified via a recovered handle).
 */
export function lookupDimensionsTrust(input: {
  sku?: string | null
  handle?: string | null
}): DimensionsTrustEntry {
  const sku = normalizeAdminSku(input.sku)
  const handle = input.handle?.trim().toLowerCase() ?? ""
  const bySku = sku ? BY_SKU[sku] : undefined
  const byHandle = handle ? BY_HANDLE[handle] : undefined

  if (sku && !bySku) {
    return UNKNOWN_TRUST
  }

  if (bySku && byHandle && bySku.state !== byHandle.state) {
    const picked = moreRestrictive(bySku, byHandle)
    return {
      ...picked,
      manager_hint_ru: `${picked.manager_hint_ru} (SKU и handle разошлись - показан более осторожный статус)`,
      technical_note: [
        picked.technical_note,
        `sku_state=${bySku.state}`,
        `handle_state=${byHandle.state}`,
      ]
        .filter(Boolean)
        .join(" · "),
      block_casual_verify_implication: true,
    }
  }
  if (bySku) return bySku
  if (byHandle) return byHandle
  return UNKNOWN_TRUST
}

/**
 * VERIFIED_CANONICAL applies only when live mm match the encoded baseline.
 * Drifted values must not keep the confirmed badge.
 */
export function applyLiveDimensionsToTrust(
  entry: DimensionsTrustEntry,
  live: {
    height_mm: number | null
    width_mm: number | null
    depth_mm: number | null
  }
): DimensionsTrustEntry {
  if (entry.state !== "VERIFIED_CANONICAL" || !entry.verified_mm) {
    return entry
  }
  const v = entry.verified_mm
  const match =
    live.height_mm === v.height_mm &&
    live.width_mm === v.width_mm &&
    live.depth_mm === v.depth_mm
  if (match) return entry
  return {
    state: "UNKNOWN",
    manager_hint_ru:
      "SKU есть в verified-карте, но текущие мм не совпадают с baseline - не считайте подтверждённым",
    technical_note: [
      entry.technical_note,
      `baseline=${v.height_mm}x${v.width_mm}x${v.depth_mm}`,
      `live=${live.height_mm ?? "?"}x${live.width_mm ?? "?"}x${live.depth_mm ?? "?"}`,
    ]
      .filter(Boolean)
      .join(" · "),
    block_casual_verify_implication: true,
  }
}

export function listDimensionsTrustSkus(): string[] {
  return Object.keys(BY_SKU).sort()
}
