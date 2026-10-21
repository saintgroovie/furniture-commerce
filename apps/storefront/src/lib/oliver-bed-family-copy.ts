import { getSeoDescriptionSource } from "./product-seo"

const INTRO = "Высокое арочное изголовье кровати собрано из мягкой панели в раме, с овальным медальоном по центру. По краям поднимаются точёные стойки с шарами-навершиями."
const COMMON = "Кровать Оливер с высоким арочным изголовьем, овальным медальоном по центру и точёными стойками с шарами-навершиями."

export const OLIVER_BED_FAMILY_COPY = {
  "ol-bed-15-16": `${COMMON} Модель с изножьем.`,
  "ol-bed-15-16-open": `${COMMON} Модель без изножья: спальное место заканчивается низкой царгой.`,
} as const

const MEMBERS = {
  "ol-15-1": ["prod_01KNTBXADF36E724RQTW6Z73B0", "OL-15-1", "ol-bed-15-16"],
  "ol-16-1": ["prod_01KNTBXADGPHKZEWKKT477WNR7", "OL-16-1", "ol-bed-15-16"],
  "ol-15-2": ["prod_01KNTBXADG6TFW8WB9SPQ4JTGD", "OL-15-2", "ol-bed-15-16-open"],
  "ol-16-2": ["prod_01KNTBXADGH3EK5BM3RAZ2Z7KT", "OL-16-2", "ol-bed-15-16-open"],
} as const

/** Owner-authorized common construction copy, without any upholstery promise. */
export function sharedOliverBedDescription(group: string, sources: Array<Record<string, unknown> | null>): string | null {
  if (!(group in OLIVER_BED_FAMILY_COPY) || sources.length !== 2) return null
  const handles = new Set<string>()
  for (const source of sources) {
    if (!source || source.status !== "published") return null
    const handle = String(source.handle)
    const expected = MEMBERS[handle as keyof typeof MEMBERS]
    const meta = source.metadata as Record<string, unknown> | undefined
    const variants = source.variants as Array<Record<string, unknown>> | undefined
    const description = getSeoDescriptionSource(source)
    if (!expected || source.id !== expected[0] || expected[2] !== group || meta?.display_group !== group ||
        variants?.length !== 1 || variants[0]?.sku !== expected[1] || !description?.startsWith(INTRO) ||
        (group.endsWith("-open") ? !description.includes("Изножья нет: спальное место заканчивается низкой царгой")
          : !description.includes("В изножье стоит такая же мягкая панель между стойками"))) return null
    handles.add(handle)
  }
  return handles.size === 2 ? OLIVER_BED_FAMILY_COPY[group as keyof typeof OLIVER_BED_FAMILY_COPY] : null
}
