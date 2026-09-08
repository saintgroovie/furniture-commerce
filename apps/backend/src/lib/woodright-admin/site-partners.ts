/** Live Woodright partner index. Stored on default Store metadata. */

export const WOODRIGHT_PARTNERS_METADATA_KEY = "woodright_partners"
export const WOODRIGHT_PARTNERS_SCHEMA_VERSION = 1

export type WoodrightPartnerPresentation = {
  id: string
  title: string
  file_url: string
  cover_url: string | null
  page_count: number | null
  mime: string | null
}

export type WoodrightPartner = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  website_url: string | null
  images: string[]
  featured: boolean
  sort_order: number
  is_active: boolean
  presentations: WoodrightPartnerPresentation[]
}

export type WoodrightPartnersDocument = {
  schema_version: 1
  partners: WoodrightPartner[]
}

export type PartnersParseFailure = {
  ok: false
  code: string
  message: string
  field?: string
}

export type PartnersParseSuccess = {
  ok: true
  value: WoodrightPartnersDocument
}

export type PartnersParseResult = PartnersParseFailure | PartnersParseSuccess

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/
const ID_RE = /^[a-zA-Z0-9_-]{1,80}$/
const MAX_PARTNERS = 80
const MAX_IMAGES = 8
const MAX_PRESENTATIONS = 8
const MAX_TEXT = 400
const MAX_NAME = 120

const PARTNER_KEYS = new Set([
  "id",
  "slug",
  "name",
  "description",
  "logo_url",
  "website_url",
  "images",
  "featured",
  "sort_order",
  "is_active",
  "presentations",
])

const PRESENTATION_KEYS = new Set([
  "id",
  "title",
  "file_url",
  "cover_url",
  "page_count",
  "mime",
])

const ALLOWED_ROOT_KEYS = new Set(["schema_version", "partners"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function fail(code: string, message: string, field?: string): PartnersParseFailure {
  return { ok: false, code, message, field }
}

function isSafeMediaUrl(value: string): boolean {
  if (!value) return false
  // Same-origin only: storefront CSP is img-src 'self'. External HTTPS would render broken.
  return value.startsWith("/static/") || value.startsWith("/product-static/")
}

function isSafeWebsiteUrl(value: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function parseOptionalUrl(
  raw: unknown,
  field: string,
  kind: "media" | "website"
): PartnersParseFailure | string | null {
  if (raw == null) return null
  if (typeof raw !== "string") return fail("invalid_url", "Некорректная ссылка", field)
  const value = raw.trim()
  if (!value) return null
  if (value.length > 500) return fail("invalid_url", "Ссылка слишком длинная", field)
  const ok = kind === "media" ? isSafeMediaUrl(value) : isSafeWebsiteUrl(value)
  if (!ok) {
    return fail(
      "invalid_url",
      kind === "media"
        ? "Медиа: только путь /static/ или /product-static/"
        : "Разрешены только http(s) ссылки на сайт",
      field
    )
  }
  return value
}

function parsePresentation(
  raw: unknown,
  field: string
): PartnersParseFailure | WoodrightPartnerPresentation {
  if (!isRecord(raw)) return fail("invalid_presentation", "Некорректная презентация", field)
  for (const key of Object.keys(raw)) {
    if (!PRESENTATION_KEYS.has(key)) {
      return fail("unknown_key", "Неизвестное поле презентации", `${field}.${key}`)
    }
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  if (!ID_RE.test(id)) return fail("invalid_id", "Укажите id презентации", `${field}.id`)
  if (!title || title.length > MAX_NAME) {
    return fail("invalid_title", "Укажите название презентации", `${field}.title`)
  }
  if (typeof raw.file_url !== "string" || !isSafeMediaUrl(raw.file_url.trim())) {
    return fail("invalid_url", "Укажите файл презентации", `${field}.file_url`)
  }
  const cover = parseOptionalUrl(raw.cover_url, `${field}.cover_url`, "media")
  if (typeof cover === "object" && cover && "ok" in cover && cover.ok === false) return cover
  let page_count: number | null = null
  if (raw.page_count != null) {
    if (typeof raw.page_count !== "number" || !Number.isInteger(raw.page_count) || raw.page_count < 1 || raw.page_count > 400) {
      return fail("invalid_page_count", "Число страниц должно быть целым от 1 до 400", `${field}.page_count`)
    }
    page_count = raw.page_count
  }
  let mime: string | null = null
  if (raw.mime != null) {
    if (typeof raw.mime !== "string") return fail("invalid_mime", "Некорректный тип файла", `${field}.mime`)
    const trimmed = raw.mime.trim().toLowerCase()
    if (trimmed && !["application/pdf", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(trimmed)) {
      return fail("invalid_mime", "Поддерживается PDF или презентация Office", `${field}.mime`)
    }
    mime = trimmed || null
  }
  return {
    id,
    title,
    file_url: raw.file_url.trim(),
    cover_url: typeof cover === "string" ? cover : null,
    page_count,
    mime,
  }
}

function parsePartner(raw: unknown, field: string): PartnersParseFailure | WoodrightPartner {
  if (!isRecord(raw)) return fail("invalid_partner", "Некорректный партнёр", field)
  for (const key of Object.keys(raw)) {
    if (!PARTNER_KEYS.has(key)) {
      return fail("unknown_key", "Неизвестное поле партнёра", `${field}.${key}`)
    }
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : ""
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (!ID_RE.test(id)) return fail("invalid_id", "Укажите id партнёра", `${field}.id`)
  if (!SLUG_RE.test(slug)) {
    return fail("invalid_slug", "Slug: латиница, цифры и дефис", `${field}.slug`)
  }
  if (!name || name.length > MAX_NAME) {
    return fail("invalid_name", "Укажите название партнёра", `${field}.name`)
  }
  let description: string | null = null
  if (raw.description != null) {
    if (typeof raw.description !== "string") {
      return fail("invalid_description", "Описание должно быть текстом", `${field}.description`)
    }
    const trimmed = raw.description.trim()
    if (trimmed.length > MAX_TEXT) {
      return fail("invalid_description", "Описание слишком длинное", `${field}.description`)
    }
    description = trimmed || null
  }
  const logo = parseOptionalUrl(raw.logo_url, `${field}.logo_url`, "media")
  if (typeof logo === "object" && logo && "ok" in logo && logo.ok === false) return logo
  const website = parseOptionalUrl(raw.website_url, `${field}.website_url`, "website")
  if (typeof website === "object" && website && "ok" in website && website.ok === false) {
    return website
  }
  const images: string[] = []
  if (raw.images != null) {
    if (!Array.isArray(raw.images) || raw.images.length > MAX_IMAGES) {
      return fail("invalid_images", "Слишком много изображений", `${field}.images`)
    }
    for (const [index, item] of raw.images.entries()) {
      if (typeof item !== "string" || !isSafeMediaUrl(item.trim())) {
        return fail("invalid_url", "Некорректное изображение", `${field}.images.${index}`)
      }
      images.push(item.trim())
    }
  }
  if (typeof raw.featured !== "boolean") {
    return fail("invalid_featured", "Укажите featured как да или нет", `${field}.featured`)
  }
  if (typeof raw.is_active !== "boolean") {
    return fail("invalid_active", "Укажите видимость партнёра", `${field}.is_active`)
  }
  if (typeof raw.sort_order !== "number" || !Number.isInteger(raw.sort_order) || raw.sort_order < 0 || raw.sort_order > 9999) {
    return fail("invalid_sort", "Порядок: целое число от 0 до 9999", `${field}.sort_order`)
  }
  const presentations: WoodrightPartnerPresentation[] = []
  if (raw.presentations != null) {
    if (!Array.isArray(raw.presentations) || raw.presentations.length > MAX_PRESENTATIONS) {
      return fail("invalid_presentations", "Слишком много презентаций", `${field}.presentations`)
    }
    const seen = new Set<string>()
    for (const [index, item] of raw.presentations.entries()) {
      const parsed = parsePresentation(item, `${field}.presentations.${index}`)
      if ("ok" in parsed && parsed.ok === false) return parsed
      const presentation = parsed as WoodrightPartnerPresentation
      if (seen.has(presentation.id)) {
        return fail("duplicate_id", "Повторяется id презентации", `${field}.presentations.${index}.id`)
      }
      seen.add(presentation.id)
      presentations.push(presentation)
    }
  }
  return {
    id,
    slug,
    name,
    description,
    logo_url: typeof logo === "string" ? logo : null,
    website_url: typeof website === "string" ? website : null,
    images,
    featured: raw.featured,
    sort_order: raw.sort_order,
    is_active: raw.is_active,
    presentations,
  }
}

export function emptyPartnersDocument(): WoodrightPartnersDocument {
  return { schema_version: 1, partners: [] }
}

export function parseWoodrightPartners(body: unknown): PartnersParseResult {
  if (!isRecord(body)) return fail("invalid_body", "Некорректный список партнёров")
  for (const key of Object.keys(body)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      return fail("unknown_key", "Неизвестное поле", key)
    }
  }
  if (body.schema_version !== WOODRIGHT_PARTNERS_SCHEMA_VERSION) {
    return fail("invalid_schema", "Неподдерживаемая версия партнёров", "schema_version")
  }
  if (!Array.isArray(body.partners)) {
    return fail("invalid_partners", "Ожидается список партнёров", "partners")
  }
  if (body.partners.length > MAX_PARTNERS) {
    return fail("invalid_partners", "Слишком много партнёров", "partners")
  }
  const partners: WoodrightPartner[] = []
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const [index, item] of body.partners.entries()) {
    const parsed = parsePartner(item, `partners.${index}`)
    if ("ok" in parsed && parsed.ok === false) return parsed
    const partner = parsed as WoodrightPartner
    if (ids.has(partner.id)) return fail("duplicate_id", "Повторяется id партнёра", `partners.${index}.id`)
    if (slugs.has(partner.slug)) {
      return fail("duplicate_slug", "Повторяется slug партнёра", `partners.${index}.slug`)
    }
    ids.add(partner.id)
    slugs.add(partner.slug)
    partners.push(partner)
  }
  return { ok: true, value: { schema_version: 1, partners } }
}

export function readPartnersDocument(
  metadata: Record<string, unknown> | null | undefined
): WoodrightPartnersDocument {
  const raw = metadata?.[WOODRIGHT_PARTNERS_METADATA_KEY]
  if (raw == null) return emptyPartnersDocument()
  const parsed = parseWoodrightPartners(raw)
  return parsed.ok ? parsed.value : emptyPartnersDocument()
}

export function mergePartnersDocument(
  existing: Record<string, unknown> | null | undefined,
  document: WoodrightPartnersDocument
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [WOODRIGHT_PARTNERS_METADATA_KEY]: document,
  }
}

export function publicPartners(document: WoodrightPartnersDocument): WoodrightPartner[] {
  return [...document.partners]
    .filter((partner) => partner.is_active)
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.name.localeCompare(b.name, "ru")
    })
}
