import { qualifiedNativeCartFamily } from "./qualified-native-family"
/**
 * Buyer title projection.
 *
 * One pipeline: backend `resolvePublicProductTitle` + `phraseBuyerTitle`,
 * then the existing heading-dimension grammar. Configuration phrases move
 * out of the base name into a caption. SKU, ids, and source strings stay put.
 */
import {
  PEDESTAL_DESK_CODE_MAP,
  type PedestalDeskCode,
} from "../../../backend/src/lib/catalog-normalization/pedestal-desk-codes"
import {
  phraseBuyerTitle,
  resolveTitleCollectionSlug,
  SINGLE_PEDESTAL_DESK_CODE_MAP,
  type SinglePedestalDeskCode,
} from "../../../backend/src/lib/catalog-normalization/buyer-title-phrasing"
import { resolvePublicProductTitle } from "../../../backend/src/lib/catalog-normalization/public-title"
import { formatBuyerFacingMeasureText } from "./buyer-measure-text"
import { layoutBuyerFacingTitle } from "./en-name-ru"
import { splitHeadingDimensions, type ExtractedHeadingSpan } from "./product-heading"

export type BuyerTitleAttribute = {
  label: string
  value: string
  source: "pedestal_phrase" | "bed_class" | "title_sleeping_place" | "title_axis" | "title_measure" | "variant_option"
}

export type BuyerTitlePresentation = {
  base_title: string
  lines: string[]
  caption: string
  attributes: BuyerTitleAttribute[]
}

type TitleInput = {
  title?: string | null
  handle?: string | null
  metadata?: Record<string, unknown> | null
  options?: unknown[]
  /** Selected variant. Class and sleeping place come from here, not the opening SKU. */
  selection?: {
    title?: string | null
    metadata?: Record<string, unknown> | null
    options?: unknown[]
  } | null
}

const CONFIG_PHRASES = [
  ...Object.values(PEDESTAL_DESK_CODE_MAP).map((item) => item.public_phrase),
  ...Object.values(SINGLE_PEDESTAL_DESK_CODE_MAP).map((item) => item.public_phrase),
].sort((a, b) => b.length - a.length)

const PEDESTAL_HEADS: Array<{ re: RegExp; head: string; tail: string }> = [
  { re: /^Двухтумбовый письменный стол(?![\p{L}\p{N}])/u, head: "Письменный стол", tail: "с двумя тумбами" },
  { re: /^Двухтумбовый кабинетный стол(?![\p{L}\p{N}])/u, head: "Кабинетный стол", tail: "с двумя тумбами" },
]

const AXIS_LABEL: Array<{ re: RegExp; label: string; order: number }> = [
  { re: /высот|выс\.?/iu, label: "В", order: 0 },
  { re: /ширин|шир\.?/iu, label: "Ш", order: 1 },
  { re: /глубин|гл\.?/iu, label: "Г", order: 2 },
  { re: /длин/iu, label: "Длина", order: 3 },
  { re: /диаметр|Ø|ø|⌀/iu, label: "Диаметр", order: 4 },
]

function capitalizePhrase(value: string): string {
  return value.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("ru-RU"))
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function cleanTitlePunctuation(title: string): string {
  return title
    .replace(/\(\s*[,;]*/gu, "(")
    .replace(/[,;]\s*\)/gu, ")")
    .replace(/\(\s*\)/gu, "")
    .replace(/,\s*,+/gu, ",")
    .replace(/\s+([,;)])/gu, "$1")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+/gu, " ")
    .replace(/^[\s,;]+|[\s,;]+$/gu, "")
    .trim()
}

function liftConfigPhrases(title: string): { title: string; phrases: string[] } {
  const phrases: string[] = []
  let next = title
  for (const phrase of CONFIG_PHRASES) {
    const re = new RegExp(escapeRe(phrase), "iu")
    if (!re.test(next)) continue
    phrases.push(capitalizePhrase(phrase))
    next = next.replace(re, " ")
  }
  return { title: cleanTitlePunctuation(next), phrases }
}

function relocateTwoPedestalHead(title: string): string {
  for (const rule of PEDESTAL_HEADS) {
    const match = title.match(rule.re)
    if (!match) continue
    const rest = title.slice(match[0].length).replace(/^[\s,]+/u, "").trim()
    if (rest.includes(rule.tail)) return cleanTitlePunctuation(`${rule.head} ${rest}`)
    const paren = rest.match(/^(.*?)(\s*\([^)]*\))\s*$/u)
    if (paren) {
      return cleanTitlePunctuation(`${rule.head} ${paren[1]!.trim()} ${rule.tail}${paren[2]}`)
    }
    return cleanTitlePunctuation(`${rule.head}${rest ? ` ${rest}` : ""} ${rule.tail}`)
  }
  return title
}

function numberTokens(raw: string): string[] {
  return [...raw.matchAll(/\d+(?:[.,]\d+)?/gu)].map((match) => match[0])
}

function unitOf(raw: string): "мм" | "см" | "м" | null {
  if (/мм|\bmm\b/iu.test(raw)) return "мм"
  if (/см|\bcm\b/iu.test(raw)) return "см"
  if (/(?<![\p{L}])м(?![\p{L}])/iu.test(raw) || /(?<![\p{L}])m(?![\p{L}])/iu.test(raw)) return "м"
  return null
}

function formatSleeping(raw: string): string {
  const nums = numberTokens(raw)
  const unit = unitOf(raw) ?? "см"
  return `${nums.join(" × ")}\u00a0${unit}`
}

function formatAxisGroup(spans: ExtractedHeadingSpan[]): string | null {
  const rows = spans
    .map((span) => {
      const known = AXIS_LABEL.find((item) => item.re.test(span.raw))
      const nums = numberTokens(span.raw)
      if (!known || nums.length === 0) return null
      return { order: known.order, label: known.label, num: nums[0]!, unit: unitOf(span.raw) }
    })
    .filter((row): row is { order: number; label: string; num: string; unit: "мм" | "см" | "м" | null } => row != null)
    .sort((a, b) => a.order - b.order)
  if (rows.length === 0) return null
  const units = new Set(rows.map((row) => row.unit))
  if (units.size === 1 && rows[0]?.unit) {
    const unit = rows[0].unit
    return `${rows.map((row) => `${row.label} ${row.num}`).join(" × ")}\u00a0${unit}`
  }
  return rows
    .map((row) => (row.unit ? `${row.label} ${row.num}\u00a0${row.unit}` : `${row.label} ${row.num}`))
    .join(" × ")
}

function attributesFromSpans(spans: ExtractedHeadingSpan[]): BuyerTitleAttribute[] {
  const attributes: BuyerTitleAttribute[] = []
  for (const span of spans) {
    if (span.role === "sleeping_place") {
      attributes.push({
        label: "Спальное место",
        value: formatSleeping(span.raw),
        source: "title_sleeping_place",
      })
      continue
    }
    if (span.role === "axis") {
      const grouped = formatAxisGroup([span])
      if (grouped) attributes.push({ label: "Габариты", value: grouped, source: "title_axis" })
      continue
    }
    if (span.role === "measure" || span.role === "body_matrix") {
      attributes.push({
        label: "Размер",
        value: span.raw.replace(/\s*[×xх*]\s*/gu, " × ").replace(/\s+/gu, " ").trim(),
        source: "title_measure",
      })
    }
  }
  const axes = spans.filter((span) => span.role === "axis")
  if (axes.length > 1) {
    const grouped = formatAxisGroup(axes)
    return [
      ...attributes.filter((item) => item.source !== "title_axis"),
      ...(grouped ? [{ label: "Габариты", value: grouped, source: "title_axis" as const }] : []),
    ]
  }
  return attributes
}

function liftBedClass(title: string): { title: string; classLabel: string | null } {
  const match = title.match(/^(Односпальная|Полутораспальная|Двуспальная) кровать(?![\p{L}\p{N}])/u)
  if (!match?.[1]) return { title, classLabel: null }
  const rest = title.slice(match[0].length).replace(/^[\s,]+/u, "").trim()
  return {
    title: cleanTitlePunctuation(rest ? `Кровать ${rest}` : "Кровать"),
    classLabel: match[1],
  }
}

function captionFrom(phrases: string[], attributes: BuyerTitleAttribute[]): string {
  const parts = [
    ...phrases,
    ...attributes
      .filter((item) => item.source === "bed_class")
      .map((item) => `Класс: ${item.value.toLocaleLowerCase("ru-RU")}`),
    ...attributes
      .filter((item) => item.source === "title_sleeping_place")
      .map((item) => `Спальное место: ${item.value}`),
    ...attributes.filter((item) => item.source === "title_axis").map((item) => item.value),
    ...attributes.filter((item) => item.source === "title_measure").map((item) => item.value),
    ...attributes.filter((item) => item.source === "variant_option").map((item) => `${item.label}: ${item.value}`),
  ]
  return parts.join("; ")
}

function projectPhrasedTitle(
  phrasedTitle: string,
  bed: boolean,
  liftClass: boolean,
): Omit<BuyerTitlePresentation, "lines"> & { bare: string } {
  const lifted = liftConfigPhrases(phrasedTitle)
  const split = splitHeadingDimensions(lifted.title, { bed })
  const classLift = liftClass ? liftBedClass(split.title) : { title: split.title, classLabel: null }
  const relocated = relocateTwoPedestalHead(classLift.title)
  const attributes: BuyerTitleAttribute[] = [
    ...lifted.phrases.map((phrase) => ({
      label: "Наполнение тумб",
      value: phrase,
      source: "pedestal_phrase" as const,
    })),
    ...(classLift.classLabel
      ? [{
          label: "Класс спального места",
          value: classLift.classLabel,
          source: "bed_class" as const,
        }]
      : []),
    ...attributesFromSpans(split.extracted),
  ]
  return {
    bare: relocated,
    base_title: relocated,
    caption: captionFrom(lifted.phrases, attributes),
    attributes,
  }
}

function confirmedSleepingDisplay(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null
  const bag = metadata.mattress_size
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return null
  const size = bag as Record<string, unknown>
  if (size.source !== "title" || size.confidence !== "high") return null
  const width = Number(size.width_cm)
  const length = Number(size.length_cm)
  if (!Number.isInteger(width) || !Number.isInteger(length) || width <= 0 || length <= 0) return null
  const display = `${width} × ${length} см`
  if (size.display != null && size.display !== display) return null
  if (size.key != null && size.key !== `${width}x${length}`) return null
  return display
}

function selectionAttributes(
  selection: NonNullable<TitleInput["selection"]>,
  slug: ReturnType<typeof resolveTitleCollectionSlug>,
  bedContext: boolean,
  productOptions: unknown[] = [],
): BuyerTitleAttribute[] {
  const metadata = selection.metadata && typeof selection.metadata === "object" ? selection.metadata : {}
  const attributes: BuyerTitleAttribute[] = []
  const title = typeof selection.title === "string" ? selection.title.trim() : ""
  if (title && !/^default$/iu.test(title)) {
    const split = splitHeadingDimensions(title, { bed: bedContext || /кроват/iu.test(title) })
    const phrased = phraseBuyerTitle(split.title, slug)
    const codePhrase = CODE_TO_PHRASE[title.replace(/[OО]/gu, "0")]
    const projected = projectPhrasedTitle(codePhrase ?? phrased.title,
      bedContext || /кроват/iu.test(title), true)
    attributes.push(...attributesFromSpans(split.extracted), ...projected.attributes)
  }
  const display = confirmedSleepingDisplay(metadata)
  if (display) {
    attributes.splice(0, attributes.length, ...attributes.filter((item) => item.source !== "title_sleeping_place"),
      { label: "Спальное место", value: display, source: "title_sleeping_place" })
  }
  // Native option values are authoritative even when the variant has an arbitrary title.
  for (const raw of selection.options ?? []) {
    const option = recordOf(raw)
    const value = typeof option?.value === "string" ? option.value.trim() : ""
    if (!value || /^default$/iu.test(value)) continue
    const related = recordOf(option?.option) ?? productOptions.map(recordOf).find((item) => item?.id === option?.option_id)
    const axis = typeof related?.title === "string" ? related.title : "Default"
    const semantic = presentBuyerOptionChoice(axis, value, { bed: bedContext, mattress: Boolean(display) })
    const label = semantic?.axisLabel ?? (/^default$/iu.test(axis) ? "Исполнение" : axis)
    const shown = semantic?.valueLabel ?? value
    const source: BuyerTitleAttribute["source"] = label === "Размер спального места" ? "title_sleeping_place"
      : label === "Наполнение тумб" ? "pedestal_phrase" : label === "Размер" ? "title_measure" : "variant_option"
    const retained = attributes.filter((item) => source === "variant_option"
      ? item.source !== source || item.label !== label
      : item.source !== source && !(source === "title_sleeping_place" && item.source === "bed_class"))
    attributes.splice(0, attributes.length, ...retained, { label, value: shown, source })
  }
  return attributes
}

export function presentBuyerTitleParts(input: TitleInput): BuyerTitlePresentation {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  // Extract before the legacy title resolver can drop a measurement while retaining its axis word.
  const bedSource = /кроват/iu.test(`${input.title ?? ""} ${metadata.public_title ?? ""} ${metadata.canonical_name ?? ""}`)
  const split = (value: string) => splitHeadingDimensions(value, { bed: bedSource })
  const sources = [metadata.public_title, input.title, metadata.canonical_name]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
  const extracted = sources.map((value) => split(value).extracted).find((spans) => spans.length) ?? []
  const titleMetadata = { ...metadata }
  for (const key of ["public_title", "canonical_name", "family_canonical_title"]) {
    if (typeof titleMetadata[key] === "string") titleMetadata[key] = split(titleMetadata[key] as string).title
  }
  const resolved = resolvePublicProductTitle({
    title: typeof input.title === "string" ? split(input.title).title : input.title,
    handle: input.handle,
    metadata: titleMetadata,
  })
  const slug = resolveTitleCollectionSlug(input.handle, metadata)
  const phrased = phraseBuyerTitle(resolved.public_title, slug)
  const bed = /кроват/iu.test(`${input.title ?? ""} ${resolved.public_title} ${phrased.title}`)
  const projected = projectPhrasedTitle(phrased.title, bed, bed)
  let attributes = [...projected.attributes, ...attributesFromSpans(extracted)]
  if (input.selection) {
    const selected = selectionAttributes(input.selection, slug, bed, input.options)
    if (selected.length) {
      const replaced = new Set(selected.map((item) => item.source))
      // A size-only selection must not retain the opening size's bed class.
      if (replaced.has("title_sleeping_place")) replaced.add("bed_class")
      attributes = [
        ...attributes.filter((item) => !replaced.has(item.source)),
        ...selected,
      ]
    }
  }
  const phrases = attributes.filter((item) => item.source === "pedestal_phrase").map((item) => item.value)
  const layout = layoutBuyerFacingTitle(projected.bare)
  return {
    base_title: formatBuyerFacingMeasureText(layout.text),
    lines: layout.lines.map((line) => formatBuyerFacingMeasureText(line)),
    caption: captionFrom(phrases, attributes),
    attributes,
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Cart and checkout share this read. The line object is not written. */
export function presentBuyerCartLine(item: Record<string, unknown>): BuyerTitlePresentation | null {
  const product = recordOf(item.product)
  const variant = recordOf(item.variant)
  const productTitle = typeof product?.title === "string" ? product.title : null
  const lineTitle = typeof item.title === "string" ? item.title : null
  const title = productTitle || lineTitle || ""
  if (!title.trim()) return null
  const handle = typeof product?.handle === "string"
    ? product.handle
    : typeof item.product_handle === "string"
      ? item.product_handle
      : typeof item.handle === "string"
        ? item.handle
        : null
  const metadata = recordOf(product?.metadata) ?? recordOf(item.metadata)
  const variantTitle = typeof variant?.title === "string"
    ? variant.title
    : typeof item.variant_title === "string"
      ? item.variant_title
      : null
  const variantMeta = recordOf(variant?.metadata)
  const variantOptions = Array.isArray(variant?.options) ? variant.options : undefined
  const selection = (variantTitle && variantTitle !== title) || variantMeta || variantOptions
    ? { title: variantTitle, metadata: variantMeta, options: variantOptions }
    : null
  const presented = presentBuyerTitleParts({ title, handle, metadata, selection,
    options: Array.isArray(product?.options) ? product.options : undefined })
  const qualified = qualifiedNativeCartFamily(item)
  if (!qualified) return presented
  const values = { ...qualified.family.fixedProperties, ...qualified.member.axes }
  delete values["Раздел"]
  const labels = new Set(Object.keys(values))
  return {
    ...presented, base_title: qualified.family.title, lines: [qualified.family.title],
    caption: Object.entries(values).map(([label, value]) => `${label}: ${value}`).join(" · "),
    attributes: [
      ...presented.attributes.filter(attribute => !labels.has(attribute.label)),
      ...Object.entries(values).map(([label, value]) => ({ label, value, source: "variant_option" as const })),
    ],
  }
}

const CODE_TO_PHRASE: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(PEDESTAL_DESK_CODE_MAP).map(([code, item]) => [code, item.public_phrase])
  ),
  ...Object.fromEntries(
    Object.entries(SINGLE_PEDESTAL_DESK_CODE_MAP).map(([code, item]) => [code, item.public_phrase])
  ),
}

const NAMED_SLEEPING_AXIS = /^(?:размер\s+спального\s+места|спальное\s+место)$/iu
const GENERIC_SIZE_AXIS = /^(?:размер|default)$/iu
const FILLING_AXIS = /^(?:наполнение(?:\s+тумб)?|комплектация|исполнение|default)$/iu

export function presentBuyerOptionChoice(
  axisTitle: string,
  value: string,
  context?: { bed?: boolean; mattress?: boolean } | null,
): { axisLabel: string; valueLabel: string } | null {
  const raw = value.trim()
  const code = raw.replace(/[OО]/gu, "0")
  const phrase = CODE_TO_PHRASE[code] ?? CODE_TO_PHRASE[raw as PedestalDeskCode | SinglePedestalDeskCode]
  if (phrase && (FILLING_AXIS.test(axisTitle) || code in CODE_TO_PHRASE)) {
    return { axisLabel: "Наполнение тумб", valueLabel: capitalizePhrase(phrase) }
  }
  const known = CONFIG_PHRASES.find((item) => item.toLocaleLowerCase("ru-RU") === raw.toLocaleLowerCase("ru-RU"))
  if (known && FILLING_AXIS.test(axisTitle)) {
    return { axisLabel: "Наполнение тумб", valueLabel: capitalizePhrase(known) }
  }
  const size = raw.match(/^(\d{2,3})\s*[×xх*]\s*(\d{2,3})(?:\s*(см))?$/u)
  if (size && (NAMED_SLEEPING_AXIS.test(axisTitle) || (GENERIC_SIZE_AXIS.test(axisTitle) && (context?.bed || context?.mattress)))) {
    const unit = size[3] ?? "см"
    return { axisLabel: "Размер спального места", valueLabel: `${size[1]} × ${size[2]}\u00a0${unit}` }
  }
  if (size && GENERIC_SIZE_AXIS.test(axisTitle)) {
    const valueLabel = size[3] ? `${size[1]} × ${size[2]}\u00a0${size[3]}` : `${size[1]} × ${size[2]}`
    return { axisLabel: "Размер", valueLabel }
  }
  return null
}
