import supplement from "./ru-supplement.json"
import brand from "./woodright-brand.json"

type Dict = Record<string, unknown>

function isDict(value: unknown): value is Dict {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Shallow-safe deep merge for nested translation objects. */
function deepMerge(base: Dict, overlay: Dict): Dict {
  const out: Dict = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const prev = out[key]
    out[key] = isDict(prev) && isDict(value) ? deepMerge(prev, value) : value
  }
  return out
}

/**
 * Extends stock Medusa Admin i18n:
 * - RU supplement for missing stock keys
 * - Woodright brand overrides for login/invite (ru + en)
 */
export default {
  ru: {
    translation: deepMerge(supplement as Dict, brand.ru.translation as Dict),
  },
  en: {
    translation: brand.en.translation,
  },
}
