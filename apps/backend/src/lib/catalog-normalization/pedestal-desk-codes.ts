/**
 * Provenance: two-pedestal desk configuration codes (Я/П).
 *
 * Canonical evidence (product.metadata.pedestal_filling + family_options):
 * - Я → DRAWERS / «Ящики»
 * - П → SHELVES / «Полки»
 *
 * Sample handles:
 * - pv-66-7 ЯП: left DRAWERS, right SHELVES
 * - pv-66-6 ПЯ: left SHELVES, right DRAWERS
 * - co-66-1 ЯЯ: DRAWERS both
 * - ol-66-1 / ol-66-4 ПП: SHELVES both
 *
 * Note: some marketing descriptions say «дверца» for Provence; structured
 * pedestal_filling wins over prose when they conflict.
 */

export type PedestalDeskCode = "ЯП" | "ПЯ" | "ЯЯ" | "ПП"

export type PedestalDeskMapping = {
  code: PedestalDeskCode
  /** Short RU phrase for title/option value. */
  public_phrase: string
  /** Longer clarification for admin / provenance. */
  meaning: string
  confidence: "VERIFIED" | "HIGH"
  sample_handles: string[]
}

export const PEDESTAL_DESK_CODE_MAP: Record<PedestalDeskCode, PedestalDeskMapping> =
  {
    ЯП: {
      code: "ЯП",
      public_phrase: "ящики слева, полки справа",
      meaning: "Left pedestal drawers, right pedestal shelves",
      confidence: "VERIFIED",
      sample_handles: ["pv-66-7"],
    },
    ПЯ: {
      code: "ПЯ",
      public_phrase: "полки слева, ящики справа",
      meaning: "Left pedestal shelves, right pedestal drawers",
      confidence: "VERIFIED",
      sample_handles: ["pv-66-6"],
    },
    ЯЯ: {
      code: "ЯЯ",
      public_phrase: "ящики с обеих сторон",
      meaning: "Drawers on both pedestals",
      confidence: "VERIFIED",
      sample_handles: ["co-66-1"],
    },
    ПП: {
      code: "ПП",
      public_phrase: "полки с обеих сторон",
      meaning: "Shelves on both pedestals",
      confidence: "VERIFIED",
      sample_handles: ["ol-66-1", "ol-66-4"],
    },
  }

const CODE_TAIL = /(?:^|[\s.])(ЯП|ПЯ|ЯЯ|ПП)\s*$/u

/** Rewrite previously applied incorrect «дверца» expansions → «полки». */
const DOOR_TO_SHELF_FIXES: Array<[RegExp, string]> = [
  [/дверцы с обеих сторон/gu, "полки с обеих сторон"],
  [/дверца слева, ящики справа/gu, "полки слева, ящики справа"],
  [/ящики слева, дверца справа/gu, "ящики слева, полки справа"],
]

export function extractPedestalDeskCode(title: string): PedestalDeskCode | null {
  const m = title.trim().match(CODE_TAIL)
  if (!m?.[1]) return null
  return m[1] as PedestalDeskCode
}

/**
 * Replace trailing factory code with natural RU phrase.
 * Also rewrites previously expanded incorrect door wording.
 */
export function expandPedestalDeskCodeInTitle(title: string): {
  title: string
  code: PedestalDeskCode | null
  changed: boolean
} {
  const original = title.trim()
  let working = original

  for (const [re, repl] of DOOR_TO_SHELF_FIXES) {
    working = working.replace(re, repl)
  }

  const code = extractPedestalDeskCode(working)
  if (!code) {
    return {
      title: working,
      code: /полки с обеих сторон/u.test(working)
        ? "ПП"
        : /полки слева, ящики/u.test(working)
          ? "ПЯ"
          : /ящики слева, полки/u.test(working)
            ? "ЯП"
            : /ящики с обеих сторон/u.test(working)
              ? "ЯЯ"
              : null,
      changed: working !== original,
    }
  }

  const mapping = PEDESTAL_DESK_CODE_MAP[code]
  const next = working
    .replace(CODE_TAIL, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*$/u, "")
    .trim()
  const expanded = `${next} (${mapping.public_phrase})`
  return { title: expanded, code, changed: expanded !== original }
}
