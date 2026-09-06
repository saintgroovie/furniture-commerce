export type DimensionAxis = "height" | "width" | "depth"

export type DimensionsCmInput = {
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
}

export type DimensionsMm = {
  height_mm?: number
  width_mm?: number
  depth_mm?: number
}

export type DimensionsCommandFailure = {
  ok: false
  message: string
  axis?: DimensionAxis
}

export type DimensionsCommandSuccess = {
  ok: true
  mm: DimensionsMm
  metadata: Record<string, unknown>
}

export function isDimensionsCommandFailure(
  value: DimensionsCommandFailure | DimensionsCmInput | DimensionsCommandSuccess
): value is DimensionsCommandFailure {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false
}

const AXIS_CM_KEY: Record<DimensionAxis, keyof DimensionsCmInput> = {
  height: "height_cm",
  width: "width_cm",
  depth: "depth_cm",
}

const AXIS_MM_KEY: Record<DimensionAxis, keyof DimensionsMm> = {
  height: "height_mm",
  width: "width_mm",
  depth: "depth_mm",
}

const BUYER_AXIS_ORDER: readonly DimensionAxis[] = ["height", "width", "depth"]

export function readDimensionsMm(metadata: Record<string, unknown> | null | undefined): DimensionsMm {
  const raw = metadata?.dimensions ?? metadata?.dimensions_normalized
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: DimensionsMm = {}
  for (const axis of BUYER_AXIS_ORDER) {
    const mm = src[AXIS_MM_KEY[axis]]
    if (typeof mm === "number" && Number.isFinite(mm) && mm > 0) {
      out[AXIS_MM_KEY[axis]] = mm
    }
  }
  return out
}

export function mmToSellerCm(mm: number | undefined): string {
  if (mm == null) return ""
  const cm = mm / 10
  if (Number.isInteger(cm)) return String(cm)
  return String(cm)
}

/**
 * Convert a seller centimetre value to integer millimetres.
 * At most one decimal place (0.1 cm = 1 mm).
 */
export function cmToMm(cm: number): number {
  return Math.round(cm * 10)
}

function parseAxisCm(value: unknown, axis: DimensionAxis): DimensionsCommandFailure | number | null {
  if (value === null || value === undefined || value === "") return null
  let numeric: number
  if (typeof value === "number") {
    numeric = value
  } else if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".")
    if (!trimmed) return null
    numeric = Number(trimmed)
  } else {
    return { ok: false, axis, message: "Укажите размер числом или оставьте поле пустым" }
  }
  if (!Number.isFinite(numeric)) {
    return { ok: false, axis, message: "Укажите размер числом или оставьте поле пустым" }
  }
  if (numeric === 0) {
    return { ok: false, axis, message: "Укажите размер или оставьте поле пустым" }
  }
  if (numeric < 0) {
    return { ok: false, axis, message: "Размер не может быть отрицательным" }
  }
  const tenths = numeric * 10
  if (Math.abs(tenths - Math.round(tenths)) > 1e-9) {
    return { ok: false, axis, message: "Укажите размер с точностью до 0,1 см" }
  }
  if (cmToMm(numeric) <= 0) {
    return { ok: false, axis, message: "Укажите размер или оставьте поле пустым" }
  }
  return numeric
}

export function parseDimensionsBody(body: unknown): DimensionsCommandFailure | DimensionsCmInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Некорректные размеры" }
  }
  const row = body as Record<string, unknown>
  const parsed: DimensionsCmInput = { height_cm: null, width_cm: null, depth_cm: null }
  for (const axis of BUYER_AXIS_ORDER) {
    const key = AXIS_CM_KEY[axis]
    if (!(key in row)) {
      parsed[key] = null
      continue
    }
    const result = parseAxisCm(row[key], axis)
    if (result && typeof result === "object" && result.ok === false) return result
    parsed[key] = result as number | null
  }
  return parsed
}

export function applyDimensionsToMetadata(
  existing: Record<string, unknown> | null | undefined,
  input: DimensionsCmInput
): DimensionsCommandSuccess | DimensionsCommandFailure {
  const mm: DimensionsMm = {}
  for (const axis of BUYER_AXIS_ORDER) {
    const cm = input[AXIS_CM_KEY[axis]]
    const parsed = parseAxisCm(cm, axis)
    if (parsed && typeof parsed === "object" && parsed.ok === false) return parsed
    if (typeof parsed === "number") {
      mm[AXIS_MM_KEY[axis]] = cmToMm(parsed)
    }
  }

  const metadata: Record<string, unknown> = { ...(existing ?? {}) }
  if (Object.keys(mm).length === 0) {
    delete metadata.dimensions
    delete metadata.dimensions_normalized
  } else {
    metadata.dimensions = { ...mm }
    metadata.dimensions_normalized = { ...mm }
  }

  return { ok: true, mm, metadata }
}
