/**
 * Allowlisted historical import provenance for admin presentation.
 *
 * TECH-WW-IMPORT-METADATA-01: `source_title` and `family_options` are
 * retained source evidence, not current title / dimensions / options SoT.
 * Unknown metadata keys are left unclassified.
 */

export const IMPORT_PROVENANCE_METADATA_KEYS = [
  "source_title",
  "family_options",
] as const

export const IMPORT_PROVENANCE_SECTION_TITLE = "Исходные данные импорта"

export const IMPORT_PROVENANCE_EXPLANATION =
  "Сохранены для сверки с исходным каталогом. Не используются как текущие название, размеры или опции товара."

export type ImportProvenanceRow = {
  key: string
  label_ru: string
  value: string
}

export type ImportProvenanceView = {
  present: true
  source_title: string | null
  family_options: Record<string, string> | null
  rows: ImportProvenanceRow[]
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

function stringifyProvenanceValue(value: unknown): string | null {
  const s = asNonEmptyString(value)
  if (s) return s
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "да" : "нет"
  return null
}

function parseFamilyOptions(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const label = asNonEmptyString(k)
    const value = stringifyProvenanceValue(v)
    if (label && value) out[label] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

function familyOptionLabelRu(key: string): string {
  if (key === "Размер") return "Размер в источнике"
  return `${key} в источнике`
}

/**
 * Returns a view only when allowlisted provenance has at least one value.
 * Never inspects or relabels unknown metadata keys.
 */
export function extractImportProvenance(
  metadata: unknown
): ImportProvenanceView | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null
  }
  const meta = metadata as Record<string, unknown>
  const source_title = asNonEmptyString(meta.source_title)
  const family_options = parseFamilyOptions(meta.family_options)
  if (!source_title && !family_options) return null

  const rows: ImportProvenanceRow[] = []
  if (source_title) {
    rows.push({
      key: "source_title",
      label_ru: "Исходное название",
      value: source_title,
    })
  }
  if (family_options) {
    for (const [key, value] of Object.entries(family_options)) {
      rows.push({
        key: `family_options.${key}`,
        label_ru: familyOptionLabelRu(key),
        value,
      })
    }
  }

  return {
    present: true,
    source_title,
    family_options,
    rows,
  }
}

export function isImportProvenanceMetadataKey(key: string): boolean {
  return (IMPORT_PROVENANCE_METADATA_KEYS as readonly string[]).includes(key)
}
