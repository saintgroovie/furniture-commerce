import { matchCandidates, type MatchResult } from "../woodright-workspace/identity"

export type IncomingPlan =
  | { action: "link_thread"; lead_id: string }
  | { action: "needs_review"; lead_ids: string[] }
  | { action: "unresolved" }

/**
 * Exact From address can suggest one existing person.
 * It never merges people, never creates a Medusa customer,
 * and does not create a Person by itself.
 */
export function planIncomingSender(result: MatchResult): IncomingPlan {
  if (result.status === "linked" && result.ids.length === 1) {
    return { action: "link_thread", lead_id: result.ids[0]! }
  }
  if (result.status === "needs_review" || result.ids.length > 1) {
    return { action: "needs_review", lead_ids: result.ids }
  }
  return { action: "unresolved" }
}

export function matchSenderAddress(
  people: Array<{ id: string; email?: string | null }>,
  from: string
): IncomingPlan {
  return planIncomingSender(matchCandidates(people, { email: from }))
}
