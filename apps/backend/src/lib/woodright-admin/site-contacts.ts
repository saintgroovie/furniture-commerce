/** Staged Woodright site contacts. Not live on the public storefront. */

export const WOODRIGHT_SITE_CONTACTS_METADATA_KEY = "woodright_site_contacts"
export const WOODRIGHT_SITE_CONTACTS_SCHEMA_VERSION = 1
export const WOODRIGHT_CONTACTS_SOURCE_STATUS = "staged_not_live" as const

export const WOODRIGHT_MESSENGER_IDS = ["telegram", "whatsapp", "max"] as const
export type WoodrightMessengerId = (typeof WOODRIGHT_MESSENGER_IDS)[number]

export type WoodrightPhoneContact = {
  display: string
  e164: string
}

export type WoodrightMessengerEnablement = {
  enabled: boolean
}

export type WoodrightSiteContacts = {
  schema_version: 1
  free_call: WoodrightPhoneContact
  write_or_call: WoodrightPhoneContact
  messengers: Record<WoodrightMessengerId, WoodrightMessengerEnablement>
}

export type ContactsParseFailure = {
  ok: false
  code: string
  message: string
  field?: string
}

export type ContactsParseSuccess = {
  ok: true
  value: WoodrightSiteContacts
}

export type ContactsParseResult = ContactsParseFailure | ContactsParseSuccess

const E164_RE = /^\+[1-9]\d{7,14}$/
const FORBIDDEN_KEYS = new Set([
  "email",
  "hours",
  "opening_hours",
  "inn",
  "ogrn",
  "ogrnip",
  "bank",
  "bank_details",
  "bank_account",
  "bik",
  "account",
  "legal_name",
  "legal_address",
  "warranty",
  "returns",
  "delivery",
  "privacy",
  "showroom_address",
  "address_lines",
])

const ALLOWED_ROOT_KEYS = new Set([
  "schema_version",
  "free_call",
  "write_or_call",
  "messengers",
])

const PHONE_KEYS = new Set(["display", "e164"])

function isParseFailure(value: ContactsParseFailure | object): value is ContactsParseFailure {
  return "ok" in value && (value as ContactsParseFailure).ok === false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function fail(code: string, message: string, field?: string): ContactsParseFailure {
  return { ok: false, code, message, field }
}

function parsePhone(raw: unknown, field: string): ContactsParseFailure | WoodrightPhoneContact {
  if (!isRecord(raw)) return fail("invalid_phone", "Укажите телефон", field)
  for (const key of Object.keys(raw)) {
    if (!PHONE_KEYS.has(key)) {
      return fail("unknown_key", "Неизвестное поле", `${field}.${key}`)
    }
  }
  const display = typeof raw.display === "string" ? raw.display.trim() : ""
  const e164 = typeof raw.e164 === "string" ? raw.e164.trim() : ""
  if (!display) return fail("invalid_phone", "Укажите телефон как его видит покупатель", `${field}.display`)
  if (display.length > 40) return fail("invalid_phone", "Телефон слишком длинный", `${field}.display`)
  if (!E164_RE.test(e164)) {
    return fail("invalid_e164", "Укажите телефон в международном формате, например +78005551736", `${field}.e164`)
  }
  return { display, e164 }
}

function parseMessengers(
  raw: unknown
): ContactsParseFailure | Record<WoodrightMessengerId, WoodrightMessengerEnablement> {
  if (!isRecord(raw)) return fail("invalid_messengers", "Укажите мессенджеры", "messengers")
  for (const key of Object.keys(raw)) {
    if (!WOODRIGHT_MESSENGER_IDS.includes(key as WoodrightMessengerId)) {
      return fail("unknown_key", "Неизвестный мессенджер", `messengers.${key}`)
    }
    const row = raw[key]
    if (!isRecord(row) || typeof row.enabled !== "boolean" || Object.keys(row).some((k) => k !== "enabled")) {
      return fail("invalid_messengers", "Для мессенджера укажите только включён или выключен", `messengers.${key}`)
    }
  }
  const messengers = {
    telegram: { enabled: false },
    whatsapp: { enabled: false },
    max: { enabled: false },
  }
  for (const id of WOODRIGHT_MESSENGER_IDS) {
    const row = raw[id]
    if (isRecord(row) && typeof row.enabled === "boolean") {
      messengers[id] = { enabled: row.enabled }
    }
  }
  return messengers
}

export function parseWoodrightSiteContacts(body: unknown): ContactsParseResult {
  if (!isRecord(body)) return fail("invalid_body", "Некорректные контакты")

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return fail("forbidden_field", "Это поле нельзя сохранить в контактах Workspace", key)
    }
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      return fail("unknown_key", "Неизвестное поле", key)
    }
  }

  if (body.schema_version !== WOODRIGHT_SITE_CONTACTS_SCHEMA_VERSION) {
    return fail("invalid_schema", "Неподдерживаемая версия контактов", "schema_version")
  }

  const free_call = parsePhone(body.free_call, "free_call")
  if (isParseFailure(free_call)) return free_call
  const write_or_call = parsePhone(body.write_or_call, "write_or_call")
  if (isParseFailure(write_or_call)) return write_or_call
  const messengers = parseMessengers(body.messengers)
  if (isParseFailure(messengers)) return messengers

  return {
    ok: true,
    value: {
      schema_version: 1,
      free_call,
      write_or_call,
      messengers,
    },
  }
}

export function readStagedSiteContacts(
  metadata: Record<string, unknown> | null | undefined
): WoodrightSiteContacts | null {
  const raw = metadata?.[WOODRIGHT_SITE_CONTACTS_METADATA_KEY]
  const parsed = parseWoodrightSiteContacts(raw)
  return parsed.ok ? parsed.value : null
}

export function mergeStagedSiteContacts(
  existing: Record<string, unknown> | null | undefined,
  contacts: WoodrightSiteContacts
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [WOODRIGHT_SITE_CONTACTS_METADATA_KEY]: contacts,
  }
}
