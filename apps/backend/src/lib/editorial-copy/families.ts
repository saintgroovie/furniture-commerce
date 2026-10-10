/**
 * Content-family source files -> per-product editorial description + apply packet.
 *
 * One family = one buyer item / model / construction. Members share the family paragraphs;
 * a member may add its own `extra` paragraphs for a confirmed variant difference.
 * Final text = [...family.paragraphs, ...member.extra].join("\n\n").
 *
 * Pure - no I/O. Parsing is strict so a typo in a source file cannot leak into a packet.
 */
import { sanitizeBuyerDescription, SHARED_EXECUTION_NOTE } from "../catalog-normalization/buyer-description"
import {
  EDITORIAL_COPY_FIELD,
  EDITORIAL_COPY_PACKET_VERSION,
  sha256Text,
  validateDescriptionText,
  type EditorialCopyPacket,
} from "./packet"

export const CONFIDENCE_LEVELS = ["EXACT", "STRONG", "AMBIGUOUS"] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export type FamilyMember = { handle: string; extra?: string[]; notes?: string }

export type ContentFamily = {
  family_id: string
  family_name: string
  product_type: string
  shared_copy_basis: string
  variant_differences: string
  evidence: string
  confidence: Confidence
  paragraphs: string[]
  members: FamilyMember[]
}

export type FamilyHold = { handle: string; family_id: string; reason: string }

export type FamilyFile = {
  collection: string
  collection_name: string
  families: ContentFamily[]
  holds: FamilyHold[]
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

const FILE_KEYS = new Set(["collection", "collection_name", "families", "holds"])
const FAMILY_KEYS = new Set([
  "family_id",
  "family_name",
  "product_type",
  "shared_copy_basis",
  "variant_differences",
  "evidence",
  "confidence",
  "paragraphs",
  "members",
])
const MEMBER_KEYS = new Set(["handle", "extra", "notes"])
const HOLD_KEYS = new Set(["handle", "family_id", "reason"])

function unknownKeys(obj: Rec, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k))
}

function paragraphError(p: unknown): string | null {
  if (!isStr(p)) return "paragraph must be a non-empty string"
  if (p !== p.trim() || /\n/.test(p)) return "paragraph must be one trimmed line"
  return null
}

export function parseFamilyFile(input: unknown, source: string): { ok: true; value: FamilyFile } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const at = (s: string) => `${source}: ${s}`
  if (!isRec(input)) return { ok: false, errors: [at("must be an object")] }
  for (const k of unknownKeys(input, FILE_KEYS)) errors.push(at(`unknown key ${k}`))
  if (!isStr(input.collection)) errors.push(at("collection is required"))
  if (!isStr(input.collection_name)) errors.push(at("collection_name is required"))
  if (!Array.isArray(input.families)) errors.push(at("families must be an array"))
  if (!Array.isArray(input.holds)) errors.push(at("holds must be an array"))
  if (errors.length) return { ok: false, errors }

  const familyIds = new Set<string>()
  ;(input.families as unknown[]).forEach((f, fi) => {
    const fa = `families[${fi}]`
    if (!isRec(f)) {
      errors.push(at(`${fa} must be an object`))
      return
    }
    for (const k of unknownKeys(f, FAMILY_KEYS)) errors.push(at(`${fa} unknown key ${k}`))
    for (const k of ["family_id", "family_name", "product_type", "shared_copy_basis", "variant_differences", "evidence"]) {
      if (!isStr(f[k])) errors.push(at(`${fa}.${k} is required`))
    }
    if (isStr(f.family_id)) {
      if (familyIds.has(f.family_id)) errors.push(at(`${fa}.family_id duplicated: ${f.family_id}`))
      familyIds.add(f.family_id)
    }
    if (!CONFIDENCE_LEVELS.includes(f.confidence as Confidence)) errors.push(at(`${fa}.confidence is invalid`))
    if (!Array.isArray(f.paragraphs) || f.paragraphs.length === 0) errors.push(at(`${fa}.paragraphs must be non-empty`))
    else f.paragraphs.forEach((p, pi) => {
      const e = paragraphError(p)
      if (e) errors.push(at(`${fa}.paragraphs[${pi}] ${e}`))
    })
    if (!Array.isArray(f.members) || f.members.length === 0) errors.push(at(`${fa}.members must be non-empty`))
    else f.members.forEach((m, mi) => {
      const ma = `${fa}.members[${mi}]`
      if (!isRec(m)) {
        errors.push(at(`${ma} must be an object`))
        return
      }
      for (const k of unknownKeys(m, MEMBER_KEYS)) errors.push(at(`${ma} unknown key ${k}`))
      if (!isStr(m.handle)) errors.push(at(`${ma}.handle is required`))
      if (m.extra !== undefined) {
        if (!Array.isArray(m.extra) || m.extra.length === 0) errors.push(at(`${ma}.extra must be a non-empty array`))
        else m.extra.forEach((p, pi) => {
          const e = paragraphError(p)
          if (e) errors.push(at(`${ma}.extra[${pi}] ${e}`))
        })
      }
      if (m.notes !== undefined && !isStr(m.notes)) errors.push(at(`${ma}.notes must be a non-empty string`))
    })
  })
  ;(input.holds as unknown[]).forEach((h, hi) => {
    const ha = `holds[${hi}]`
    if (!isRec(h)) {
      errors.push(at(`${ha} must be an object`))
      return
    }
    for (const k of unknownKeys(h, HOLD_KEYS)) errors.push(at(`${ha} unknown key ${k}`))
    for (const k of ["handle", "family_id", "reason"]) if (!isStr(h[k])) errors.push(at(`${ha}.${k} is required`))
  })
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: input as unknown as FamilyFile }
}

export function composeMemberDescription(family: ContentFamily, member: FamilyMember): string {
  return [...family.paragraphs, ...(member.extra ?? [])].join("\n\n")
}

export type EditorialAssignment =
  | {
      kind: "copy"
      handle: string
      collection: string
      collection_name: string
      family: ContentFamily
      member: FamilyMember
      description: string
    }
  | {
      kind: "hold"
      handle: string
      collection: string
      collection_name: string
      hold: FamilyHold
    }

/** Merge parsed files; every handle must appear exactly once across all files. */
export function indexAssignments(files: FamilyFile[]): { ok: true; value: Map<string, EditorialAssignment> } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const map = new Map<string, EditorialAssignment>()
  const familyIds = new Set<string>()
  for (const file of files) {
    for (const family of file.families) {
      if (familyIds.has(family.family_id)) errors.push(`family_id duplicated across files: ${family.family_id}`)
      familyIds.add(family.family_id)
      for (const member of family.members) {
        if (map.has(member.handle)) errors.push(`handle assigned twice: ${member.handle}`)
        const description = composeMemberDescription(family, member)
        const textErr = validateDescriptionText(description)
        if (textErr) errors.push(`${member.handle}: ${textErr}`)
        map.set(member.handle, {
          kind: "copy",
          handle: member.handle,
          collection: file.collection,
          collection_name: file.collection_name,
          family,
          member,
          description,
        })
      }
    }
    for (const hold of file.holds) {
      if (map.has(hold.handle)) errors.push(`handle assigned twice: ${hold.handle}`)
      map.set(hold.handle, { kind: "hold", handle: hold.handle, collection: file.collection, collection_name: file.collection_name, hold })
    }
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: map }
}

export type CurrentCopyClass = "empty" | "technical" | "boilerplate" | "prefix_mangled" | "editorial"

/**
 * What the buyer sees today.
 *   empty        - no description;
 *   technical    - only price-list provenance lines (hidden by the #301 sanitizer);
 *   prefix_mangled - starts with a broken «Type Name:» import prefix;
 *   boilerplate  - carries the shared import note appended to every row;
 *   editorial    - anything else.
 */
export function classifyCurrentDescription(raw: string | null | undefined, title?: string | null): CurrentCopyClass {
  if (typeof raw !== "string" || !raw.trim()) return "empty"
  const visible = sanitizeBuyerDescription(raw, { title, dropSharedNote: true }).text
  if (visible === null) return raw.includes(SHARED_EXECUTION_NOTE) ? "boilerplate" : "technical"
  const firstLine = visible.split("\n")[0] ?? ""
  if (/^[А-ЯЁ][а-яё]+(?:\s[А-ЯЁA-Z][\p{L}-]*)+:\s/u.test(firstLine) && /[A-Za-z]{3,}/.test(firstLine.split(":")[0])) {
    return "prefix_mangled"
  }
  if (raw.includes(SHARED_EXECUTION_NOTE)) return "boilerplate"
  return "editorial"
}

export type EditorialAction = "KEEP" | "REWRITE" | "ADD" | "REMOVE" | "HOLD"

export function decideAction(current: CurrentCopyClass, currentRaw: string | null, proposed: string | null): EditorialAction {
  if (proposed === null) return "HOLD"
  if (current === "empty" || current === "technical") return "ADD"
  if ((currentRaw ?? "") === proposed) return "KEEP"
  return "REWRITE"
}

export type PacketSourceRow = { product_id: string; handle: string; description: string | null; proposed: string | null }

/** Packet rows for every product whose description changes; sorted by handle for a stable file. */
export function buildEditorialPacket(
  rows: PacketSourceRow[],
  meta: { packet_id: string; generated_from: string }
): EditorialCopyPacket {
  const items = rows
    .filter((r) => r.proposed !== null && r.proposed !== (r.description ?? null))
    .map((r) => ({
      product_id: r.product_id,
      handle: r.handle,
      field: EDITORIAL_COPY_FIELD,
      before_sha256: sha256Text(r.description),
      after: r.proposed as string,
    }))
    .sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0))
  return {
    packet_version: EDITORIAL_COPY_PACKET_VERSION,
    packet_id: meta.packet_id,
    field: EDITORIAL_COPY_FIELD,
    generated_from: meta.generated_from,
    items,
  }
}
