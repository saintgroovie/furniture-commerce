/**
 * Greenwich bed GR-BED-POOL dimension contract builder.
 * Splits headboard × frame material × fabric upholstery with scoped galleries.
 */

import { fallbackHexForToken } from "./dimension-swatch-hex"

export type GreenwichBedComboKey =
  | "natural_beige"
  | "dark_beige"
  | "natural_darkblue"
  | "dark_darkblue"

export type GreenwichBedMatrixEntry = {
  headboard_model: string
  frame_material: "natural" | "dark"
  fabric_upholstery: "beige" | "darkblue"
  combo_key: GreenwichBedComboKey
  label: string
  urls: string[]
}

export type GreenwichBedDimensionBundle = {
  headboard_model_executions: Array<{ key: string; label: string; urls: string[] }>
  frame_material_executions: Array<{
    key: string
    label: string
    urls: string[]
    swatch_hex?: string
  }>
  fabric_upholstery_executions: Array<{
    key: string
    label: string
    urls: string[]
    swatch_hex?: string
  }>
  bed_execution_matrix: GreenwichBedMatrixEntry[]
  shared_scene_media: Array<{
    key: string
    label: string
    urls: string[]
    scene_type: string
  }>
  headboard_model_labels: Record<string, string>
  frame_material_labels: Record<string, string>
  fabric_upholstery_labels: Record<string, string>
  thumbnail_url: string
  /** Flat gallery for Medusa images[] — union of matrix heroes + per-model galleries only */
  gallery_urls: string[]
}

const HEADBOARDS = [
  { key: "frame", label: "Frame" },
  { key: "cloud", label: "Cloud" },
  { key: "plane", label: "Plane" },
] as const

const COMBO_ORDER: GreenwichBedComboKey[] = [
  "natural_beige",
  "dark_beige",
  "natural_darkblue",
  "dark_darkblue",
]

const FRAME_LABELS: Record<string, string> = {
  natural: "Светлое дерево",
  dark: "Тёмное дерево",
}

const FABRIC_LABELS: Record<string, string> = {
  beige: "Светло-серая",
  darkblue: "Сине-зелёная",
}

/** Authoritative swatch fills for dimension-only bed selectors. */
const FRAME_SWATCH_HEX = {
  natural: fallbackHexForToken("natural"),
  dark: fallbackHexForToken("dark"),
} as const

const FABRIC_SWATCH_HEX = {
  beige: fallbackHexForToken("beige"),
  darkblue: fallbackHexForToken("darkblue"),
} as const

const HEADBOARD_LABELS: Record<string, string> = {
  frame: "Frame",
  cloud: "Cloud",
  plane: "Plane",
}

function basename(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function parseComboKey(filename: string): GreenwichBedComboKey | null {
  const m = filename.match(/(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/i)
  return m ? (m[1].toLowerCase() as GreenwichBedComboKey) : null
}

function splitCombo(combo: GreenwichBedComboKey): {
  frame_material: "natural" | "dark"
  fabric_upholstery: "beige" | "darkblue"
} {
  const [frame, fabric] = combo.split("_") as ["natural" | "dark", "beige" | "darkblue"]
  return { frame_material: frame, fabric_upholstery: fabric }
}

function headboardFromFilename(filename: string): string | null {
  const hay = filename.toLowerCase()
  if (/gr-bed-pool_frame|_frame_|greenwich_frame|greenwich_fame/.test(hay)) return "frame"
  if (/gr-bed-pool_cloud|_cloud_|greenwich_cloud/.test(hay)) return "cloud"
  if (/gr-bed-pool_plane|_plane_|greenwich_plane|wideheader/.test(hay)) return "plane"
  return null
}

function isHeroComboShot(filename: string): boolean {
  return /greenwich_(frame|fame|cloud|plane)_/.test(filename) && parseComboKey(filename) != null
}

function isHeadboardGalleryShot(headboard: string, filename: string): boolean {
  const hay = filename.toLowerCase()
  if (headboard === "frame") {
    return (
      /gr-bed-pool_frame_\d{2}\./.test(hay) ||
      /gr-bed-pool_frame_noliver/.test(hay)
    )
  }
  if (headboard === "cloud") {
    return /gr-bed-pool_cloud_(0[9]|1[0-6])\./.test(hay)
  }
  if (headboard === "plane") {
    return /gr-bed-pool_plane_(1[7-9]|2[0-3])\./.test(hay)
  }
  return false
}

function isSharedInterior(filename: string): boolean {
  return /bedroom\d*_int_|_int_view/i.test(filename)
}

function sortGalleryUrls(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const fa = basename(a)
    const fb = basename(b)
    const na = fa.match(/_(\d{2})\./)?.[1]
    const nb = fb.match(/_(\d{2})\./)?.[1]
    if (na && nb) return Number(na) - Number(nb)
    return fa.localeCompare(fb)
  })
}

export function buildGreenwichBedDimensionBundle(
  galleryUrls: string[]
): GreenwichBedDimensionBundle {
  const relUrls = galleryUrls.map((u) => (u.startsWith("/") ? u : `/${u}`))

  const heroes = new Map<string, Map<GreenwichBedComboKey, string>>()
  const galleries = new Map<string, string[]>()
  const sharedInteriors: string[] = []

  for (const hb of HEADBOARDS) {
    heroes.set(hb.key, new Map())
    galleries.set(hb.key, [])
  }

  for (const url of relUrls) {
    const file = basename(url)

    if (isSharedInterior(file)) {
      sharedInteriors.push(url)
      continue
    }

    const hb = headboardFromFilename(file)
    if (!hb) continue

    const combo = parseComboKey(file)
    if (combo && isHeroComboShot(file)) {
      heroes.get(hb)!.set(combo, url)
      continue
    }

    if (isHeadboardGalleryShot(hb, file)) {
      galleries.get(hb)!.push(url)
      continue
    }
  }

  const matrix: GreenwichBedMatrixEntry[] = []

  for (const hb of HEADBOARDS) {
    const hbHeroes = heroes.get(hb.key) ?? new Map()
    /* Headboard pool shots (frame_01…) stay out of every combo cell — they
       are unscoped and would leak foreign fabric/wood into the PDP strip.
       Pool URLs remain available via gallery_urls for Medusa images[]. */

    for (const combo of COMBO_ORDER) {
      const hero = hbHeroes.get(combo)
      if (!hero) continue
      const { frame_material, fabric_upholstery } = splitCombo(combo)
      /* Cell = combo hero + any other same-combo-tagged shots for this headboard. */
      const comboExtras: string[] = []
      for (const url of relUrls) {
        const file = basename(url)
        if (headboardFromFilename(file) !== hb.key) continue
        const urlCombo = parseComboKey(file)
        if (urlCombo !== combo) continue
        if (url === hero) continue
        comboExtras.push(url)
      }
      const urls = [hero, ...sortGalleryUrls(comboExtras)]
      matrix.push({
        headboard_model: hb.key,
        frame_material,
        fabric_upholstery,
        combo_key: combo,
        label: `${FRAME_LABELS[frame_material]} · ${FABRIC_LABELS[fabric_upholstery]}`,
        urls,
      })
    }
  }

  const headboard_model_executions = HEADBOARDS.map((hb) => {
    const firstHero =
      matrix.find((m) => m.headboard_model === hb.key)?.urls[0] ??
      sortGalleryUrls(galleries.get(hb.key) ?? [])[0] ??
      ""
    return {
      key: hb.key,
      label: hb.label,
      urls: firstHero ? [firstHero] : [],
    }
  }).filter((e) => e.urls.length > 0)

  const frame_material_executions = (["natural", "dark"] as const).map((key) => ({
    key,
    label: FRAME_LABELS[key]!,
    urls: [] as string[],
    swatch_hex: FRAME_SWATCH_HEX[key],
  }))

  const fabric_upholstery_executions = (["beige", "darkblue"] as const).map((key) => ({
    key,
    label: FABRIC_LABELS[key]!,
    urls: [] as string[],
    swatch_hex: FABRIC_SWATCH_HEX[key],
  }))

  const defaultMatrix =
    matrix.find((m) => m.headboard_model === "frame" && m.combo_key === "natural_beige") ??
    matrix[0]

  const thumbnail_url =
    defaultMatrix?.urls[0] ??
    "/static/products/greenwich/beds-shared/GR-BED-POOL_frame_01.jpg"

  const gallerySet = new Set<string>()
  for (const entry of matrix) {
    for (const u of entry.urls) gallerySet.add(u)
  }
  /* Keep headboard pool + interiors in the flat gallery for Medusa images[],
     but they are not duplicated into every matrix cell. */
  for (const hb of HEADBOARDS) {
    for (const u of galleries.get(hb.key) ?? []) gallerySet.add(u)
  }
  for (const u of sharedInteriors) gallerySet.add(u)

  const shared_scene_media =
    sharedInteriors.length > 0
      ? [
          {
            key: "interior",
            label: "Интерьер",
            urls: sharedInteriors,
            scene_type: "interior",
          },
        ]
      : []

  return {
    headboard_model_executions,
    frame_material_executions,
    fabric_upholstery_executions,
    bed_execution_matrix: matrix,
    shared_scene_media,
    headboard_model_labels: HEADBOARD_LABELS,
    frame_material_labels: FRAME_LABELS,
    fabric_upholstery_labels: FABRIC_LABELS,
    thumbnail_url,
    gallery_urls: [...gallerySet],
  }
}
