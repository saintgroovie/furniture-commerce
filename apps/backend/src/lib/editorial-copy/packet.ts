/**
 * Editorial copy apply packet - the only input the description importer accepts.
 *
 * A packet is a closed list of `{ product_id, handle, before_sha256, after }` rows for
 * `product.description`. Nothing else can be expressed: no other field, no create,
 * no status / price / title / handle. Parsing is strict and fail-closed.
 *
 * Pure - no I/O.
 */
import { createHash } from "node:crypto"

export const EDITORIAL_COPY_PACKET_VERSION = "woodright-editorial-copy/v1" as const
export const EDITORIAL_COPY_ROLLBACK_VERSION = "woodright-editorial-copy-rollback/v1" as const
export const EDITORIAL_COPY_FIELD = "description" as const
export const EDITORIAL_COPY_MAX_LENGTH = 2000

export type EditorialCopyItem = {
  product_id: string
  handle: string
  field: typeof EDITORIAL_COPY_FIELD
  before_sha256: string
  after: string
}

export type EditorialCopyPacket = {
  packet_version: typeof EDITORIAL_COPY_PACKET_VERSION
  packet_id: string
  field: typeof EDITORIAL_COPY_FIELD
  generated_from: string
  items: EditorialCopyItem[]
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const PACKET_KEYS = ["field", "generated_from", "items", "packet_id", "packet_version"]
const ITEM_KEYS = ["after", "before_sha256", "field", "handle", "product_id"]
const PRODUCT_ID_RE = /^prod_[A-Za-z0-9]+$/
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHA256_RE = /^[0-9a-f]{64}$/
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/

/** Empty / missing description hashes like the empty string. */
export function sha256Text(value: string | null | undefined): string {
  return createHash("sha256").update(typeof value === "string" ? value : "", "utf8").digest("hex")
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** SHA-256 of the canonical (key-sorted) JSON - independent of file formatting. */
export function computeArtifactSha(artifact: unknown): string {
  return createHash("sha256").update(stableStringify(artifact), "utf8").digest("hex")
}

function exactKeys(obj: Record<string, unknown>, expected: string[]): string | null {
  const keys = Object.keys(obj).sort()
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    return `keys must be exactly [${expected.join(", ")}], got [${keys.join(", ")}]`
  }
  return null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

export function validateDescriptionText(text: unknown): string | null {
  if (typeof text !== "string") return "after must be a string"
  if (!text.trim()) return "after must not be empty"
  if (text !== text.trim()) return "after must not have leading/trailing whitespace"
  if (text.length > EDITORIAL_COPY_MAX_LENGTH) return `after longer than ${EDITORIAL_COPY_MAX_LENGTH}`
  if (text.includes("\r")) return "after must use \\n line breaks"
  if (CONTROL_RE.test(text)) return "after contains control characters"
  if (/\n{3,}/.test(text)) return "after has more than one blank line between paragraphs"
  return null
}

export function parseEditorialCopyPacket(input: unknown): ParseResult<EditorialCopyPacket> {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["packet must be an object"] }
  const keyErr = exactKeys(input, PACKET_KEYS)
  if (keyErr) errors.push(`packet ${keyErr}`)
  if (input.packet_version !== EDITORIAL_COPY_PACKET_VERSION) {
    errors.push(`packet_version must be ${EDITORIAL_COPY_PACKET_VERSION}`)
  }
  if (input.field !== EDITORIAL_COPY_FIELD) errors.push(`field must be ${EDITORIAL_COPY_FIELD}`)
  if (typeof input.packet_id !== "string" || !input.packet_id.trim()) errors.push("packet_id is required")
  if (typeof input.generated_from !== "string") errors.push("generated_from must be a string")
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push("items must be a non-empty array")
    return { ok: false, errors }
  }

  const ids = new Set<string>()
  const handles = new Set<string>()
  let prevHandle = ""
  input.items.forEach((raw, i) => {
    const at = `items[${i}]`
    if (!isRecord(raw)) {
      errors.push(`${at} must be an object`)
      return
    }
    const ik = exactKeys(raw, ITEM_KEYS)
    if (ik) errors.push(`${at} ${ik}`)
    if (raw.field !== EDITORIAL_COPY_FIELD) errors.push(`${at}.field must be ${EDITORIAL_COPY_FIELD}`)
    const id = raw.product_id
    const handle = raw.handle
    if (typeof id !== "string" || !PRODUCT_ID_RE.test(id)) errors.push(`${at}.product_id is invalid`)
    else if (ids.has(id)) errors.push(`${at}.product_id duplicated: ${id}`)
    else ids.add(id)
    if (typeof handle !== "string" || !HANDLE_RE.test(handle)) errors.push(`${at}.handle is invalid`)
    else {
      if (handles.has(handle)) errors.push(`${at}.handle duplicated: ${handle}`)
      handles.add(handle)
      if (handle <= prevHandle) errors.push(`${at}.handle not in ascending order`)
      prevHandle = handle
    }
    if (typeof raw.before_sha256 !== "string" || !SHA256_RE.test(raw.before_sha256)) {
      errors.push(`${at}.before_sha256 must be a lowercase sha256 hex`)
    }
    const textErr = validateDescriptionText(raw.after)
    if (textErr) errors.push(`${at}.${textErr}`)
  })

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: input as unknown as EditorialCopyPacket }
}

export type EditorialRollbackItem = {
  product_id: string
  handle: string
  /** Exact pre-apply value (null when the description was unset). */
  restore_description: string | null
  /** Hash of the value the apply wrote - rollback refuses if the row moved on. */
  expected_current_sha256: string
}

export type EditorialRollbackArtifact = {
  artifact_version: typeof EDITORIAL_COPY_ROLLBACK_VERSION
  packet_id: string
  packet_sha256: string
  field: typeof EDITORIAL_COPY_FIELD
  items: EditorialRollbackItem[]
}

const ROLLBACK_KEYS = ["artifact_version", "field", "items", "packet_id", "packet_sha256"]
const ROLLBACK_ITEM_KEYS = ["expected_current_sha256", "handle", "product_id", "restore_description"]

export function parseEditorialRollbackArtifact(input: unknown): ParseResult<EditorialRollbackArtifact> {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["rollback artifact must be an object"] }
  const keyErr = exactKeys(input, ROLLBACK_KEYS)
  if (keyErr) errors.push(`artifact ${keyErr}`)
  if (input.artifact_version !== EDITORIAL_COPY_ROLLBACK_VERSION) {
    errors.push(`artifact_version must be ${EDITORIAL_COPY_ROLLBACK_VERSION}`)
  }
  if (input.field !== EDITORIAL_COPY_FIELD) errors.push(`field must be ${EDITORIAL_COPY_FIELD}`)
  if (typeof input.packet_id !== "string" || !input.packet_id.trim()) errors.push("packet_id is required")
  if (typeof input.packet_sha256 !== "string" || !SHA256_RE.test(input.packet_sha256)) {
    errors.push("packet_sha256 must be a sha256 hex")
  }
  if (!Array.isArray(input.items)) {
    errors.push("items must be an array")
    return { ok: false, errors }
  }
  const ids = new Set<string>()
  input.items.forEach((raw, i) => {
    const at = `items[${i}]`
    if (!isRecord(raw)) {
      errors.push(`${at} must be an object`)
      return
    }
    const ik = exactKeys(raw, ROLLBACK_ITEM_KEYS)
    if (ik) errors.push(`${at} ${ik}`)
    if (typeof raw.product_id !== "string" || !PRODUCT_ID_RE.test(raw.product_id)) {
      errors.push(`${at}.product_id is invalid`)
    } else if (ids.has(raw.product_id)) errors.push(`${at}.product_id duplicated`)
    else ids.add(raw.product_id)
    if (typeof raw.handle !== "string" || !HANDLE_RE.test(raw.handle)) errors.push(`${at}.handle is invalid`)
    if (raw.restore_description !== null && typeof raw.restore_description !== "string") {
      errors.push(`${at}.restore_description must be string or null`)
    }
    if (typeof raw.expected_current_sha256 !== "string" || !SHA256_RE.test(raw.expected_current_sha256)) {
      errors.push(`${at}.expected_current_sha256 must be a sha256 hex`)
    }
  })
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: input as unknown as EditorialRollbackArtifact }
}
