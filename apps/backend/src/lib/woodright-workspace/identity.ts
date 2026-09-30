export type MatchStatus = "none" | "linked" | "needs_review"

export type IdentityCandidate = {
  id: string
  email?: string | null
  phone?: string | null
}

export type MatchResult = {
  status: MatchStatus
  ids: string[]
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const email = value.trim().toLowerCase()
  if (!email || !email.includes("@")) return null
  return email
}

/** Keep digits. Russian 8XXXXXXXXXX becomes 7XXXXXXXXXX. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, "")
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`
  }
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length < 10) return null
  return digits
}

/**
 * Deterministic match. One strong hit can be offered for an explicit link.
 * Two or more hits stay needs_review. This function never merges records.
 */
export function matchCandidates(
  candidates: IdentityCandidate[],
  signal: { email?: string | null; phone?: string | null }
): MatchResult {
  const email = normalizeEmail(signal.email)
  const phone = normalizePhone(signal.phone)
  if (!email && !phone) return { status: "none", ids: [] }

  const hits = new Set<string>()
  for (const candidate of candidates) {
    const candidateEmail = normalizeEmail(candidate.email)
    const candidatePhone = normalizePhone(candidate.phone)
    const emailHit = Boolean(email && candidateEmail && email === candidateEmail)
    const phoneHit = Boolean(phone && candidatePhone && phone === candidatePhone)
    if (emailHit || phoneHit) hits.add(candidate.id)
  }

  const ids = [...hits]
  if (ids.length === 0) return { status: "none", ids: [] }
  if (ids.length === 1) return { status: "linked", ids }
  return { status: "needs_review", ids }
}
