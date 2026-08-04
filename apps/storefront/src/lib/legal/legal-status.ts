/**
 * Legal content approval contract (fail-closed for public launch).
 *
 * States:
 * - draft: incomplete / not ready for owner review
 * - owner_review: complete enough for owner/legal review (not launch-ready)
 * - approved: only after explicit OWNER_LEGAL_CONTENT_APPROVED (+ approval ID)
 *
 * Never invent approval IDs or mark approved without owner token.
 */

export type LegalDocumentStatus = "draft" | "owner_review" | "approved"

export type LegalDocumentMeta = {
  version: string
  status: LegalDocumentStatus
  /** ISO-8601 date (YYYY-MM-DD) when this version became effective for buyers. */
  effectiveDate: string
  /** Empty until owner approval. */
  approvalId: string | null
  /** Empty until approved merge SHA is recorded. */
  approvedSha: string | null
  /** Optional checksum of sealed owner inputs (name only, not secret). */
  sourceChecksum: string | null
}

/** Current repository legal pack - owner review, not approved. */
export const LEGAL_DOCUMENT_META: LegalDocumentMeta = {
  version: "2026.08.04-owner-review",
  status: "owner_review",
  effectiveDate: "2026-08-04",
  approvalId: null,
  approvedSha: null,
  sourceChecksum: null,
}

export function parseLegalDocumentStatus(
  raw: string | undefined | null
): LegalDocumentStatus | undefined {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "draft" || v === "owner_review" || v === "approved") return v
  return undefined
}

export type LegalStatusGateResult = {
  ok: boolean
  status: LegalDocumentStatus
  blockers: string[]
}

/**
 * Public launch requires approved + approvalId + version + effectiveDate.
 * owner_review and draft always block launch.
 */
export function evaluateLegalStatusForPublicLaunch(
  meta: LegalDocumentMeta = LEGAL_DOCUMENT_META,
  envStatus: string | undefined | null = process.env.WOODRIGHT_LEGAL_CONTENT_STATUS
): LegalStatusGateResult {
  const blockers: string[] = []
  const raw = String(envStatus ?? "").trim()
  const fromEnv = parseLegalDocumentStatus(envStatus)

  // Fail closed: missing/invalid env status never inherits approved from meta alone.
  if (!raw) {
    blockers.push("WOODRIGHT_LEGAL_CONTENT_STATUS missing")
  } else if (!fromEnv) {
    blockers.push(`WOODRIGHT_LEGAL_CONTENT_STATUS invalid="${raw}"`)
  }

  const status: LegalDocumentStatus = fromEnv ?? "draft"

  if (status !== "approved" || meta.status !== "approved") {
    blockers.push(
      `LEGAL_CONTENT_STATUS env=${status} meta=${meta.status} (both must be approved)`
    )
  }
  if (status === "approved" && meta.status === "approved") {
    if (!meta.approvalId || !String(meta.approvalId).trim()) {
      blockers.push("approvalId missing for approved legal content")
    }
    if (!meta.version || !String(meta.version).trim()) {
      blockers.push("legal content version missing")
    }
    if (!meta.effectiveDate || !String(meta.effectiveDate).trim()) {
      blockers.push("legal content effectiveDate missing")
    }
    if (!meta.approvedSha || !String(meta.approvedSha).trim()) {
      blockers.push("approvedSha missing for approved legal content")
    }
  }

  return { ok: blockers.length === 0, status, blockers }
}
