import { matchCandidates, type IdentityCandidate } from "../woodright-workspace/identity"

/** Page through leads. If the cap is hit, the lookup is incomplete and must not create silently. */
export async function collectIdentityCandidates(
  load: (skip: number, take: number) => Promise<IdentityCandidate[]>
): Promise<{ candidates: IdentityCandidate[]; complete: boolean }> {
  const candidates: IdentityCandidate[] = []
  const take = 200
  const cap = 20000
  for (let skip = 0; skip < cap; skip += take) {
    const batch = await load(skip, take)
    candidates.push(...batch)
    if (batch.length < take) return { candidates, complete: true }
  }
  return { candidates, complete: false }
}

export type DeskPersonPlan =
  | { action: "create" }
  | { action: "need_name" }
  | { action: "confirm_existing"; ids: string[] }
  | { action: "lookup_incomplete" }

/**
 * A desk person is a lead, never a store customer.
 * An exact email or phone match warns. It does not merge and does not block
 * once the employee confirms this is a different person.
 */
export function planDeskPerson(input: {
  name: string
  email?: string | null
  phone?: string | null
  existing: IdentityCandidate[]
  confirm: boolean
  lookupComplete?: boolean
}): DeskPersonPlan {
  if (!input.name.trim()) return { action: "need_name" }
  if (input.lookupComplete === false && !input.confirm) return { action: "lookup_incomplete" }
  const match = matchCandidates(input.existing, { email: input.email, phone: input.phone })
  if (match.ids.length > 0 && !input.confirm) return { action: "confirm_existing", ids: match.ids }
  return { action: "create" }
}
