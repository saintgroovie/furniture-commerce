/**
 * Plan for the editorial description importer.
 *
 * Every packet row is checked against the live row before anything is written:
 *   unknown product / handle mismatch / description drift  -> the whole plan fails closed;
 *   live description already equals `after`               -> noop (re-runs are idempotent);
 *   live description hash equals `before_sha256`           -> update.
 *
 * The only write payload this module can produce is `{ description }`.
 * Pure - no I/O.
 */
import {
  EDITORIAL_COPY_FIELD,
  EDITORIAL_COPY_ROLLBACK_VERSION,
  sha256Text,
  type EditorialCopyPacket,
  type EditorialRollbackArtifact,
} from "./packet"

export type LiveProductRow = {
  id: string
  handle: string
  description: string | null
}

export type PlanFailureCode =
  | "unknown_product"
  | "duplicate_live_row"
  | "handle_mismatch"
  | "before_drift"

export type PlanItem = {
  product_id: string
  handle: string
  action: "update" | "noop"
  before: string | null
  after: string | null
}

export type PlanFailure = { product_id: string; handle: string; code: PlanFailureCode; detail: string }

export type EditorialPlan = {
  ok: boolean
  items: PlanItem[]
  failures: PlanFailure[]
  counts: { update: number; noop: number; failed: number }
}

/** The single allowed update shape. */
export type DescriptionUpdate = { id: string; data: { description: string | null } }

type PlanRow = { product_id: string; handle: string; expected_sha256: string; target: string | null }

function indexLive(live: LiveProductRow[]): { byId: Map<string, LiveProductRow>; dup: Set<string> } {
  const byId = new Map<string, LiveProductRow>()
  const dup = new Set<string>()
  for (const row of live) {
    if (byId.has(row.id)) dup.add(row.id)
    byId.set(row.id, row)
  }
  return { byId, dup }
}

function planRows(rows: PlanRow[], live: LiveProductRow[]): EditorialPlan {
  const { byId, dup } = indexLive(live)
  const items: PlanItem[] = []
  const failures: PlanFailure[] = []
  for (const r of rows) {
    const cur = byId.get(r.product_id)
    if (dup.has(r.product_id)) {
      failures.push({ product_id: r.product_id, handle: r.handle, code: "duplicate_live_row", detail: "live lookup returned the id twice" })
      continue
    }
    if (!cur) {
      failures.push({ product_id: r.product_id, handle: r.handle, code: "unknown_product", detail: "product id not found" })
      continue
    }
    if (cur.handle !== r.handle) {
      failures.push({
        product_id: r.product_id,
        handle: r.handle,
        code: "handle_mismatch",
        detail: `live handle is ${cur.handle}`,
      })
      continue
    }
    const liveDescription = typeof cur.description === "string" ? cur.description : null
    if (liveDescription === r.target) {
      items.push({ product_id: r.product_id, handle: r.handle, action: "noop", before: liveDescription, after: r.target })
      continue
    }
    if (sha256Text(liveDescription) !== r.expected_sha256) {
      failures.push({
        product_id: r.product_id,
        handle: r.handle,
        code: "before_drift",
        detail: `live sha256 ${sha256Text(liveDescription)} != expected ${r.expected_sha256}`,
      })
      continue
    }
    items.push({ product_id: r.product_id, handle: r.handle, action: "update", before: liveDescription, after: r.target })
  }
  const update = items.filter((i) => i.action === "update").length
  return {
    ok: failures.length === 0,
    items,
    failures,
    counts: { update, noop: items.length - update, failed: failures.length },
  }
}

export function planEditorialCopy(packet: EditorialCopyPacket, live: LiveProductRow[]): EditorialPlan {
  return planRows(
    packet.items.map((i) => ({
      product_id: i.product_id,
      handle: i.handle,
      expected_sha256: i.before_sha256,
      target: i.after,
    })),
    live
  )
}

export function planEditorialRollback(artifact: EditorialRollbackArtifact, live: LiveProductRow[]): EditorialPlan {
  return planRows(
    artifact.items.map((i) => ({
      product_id: i.product_id,
      handle: i.handle,
      expected_sha256: i.expected_current_sha256,
      target: i.restore_description,
    })),
    live
  )
}

/** Throws unless the plan is fully clean; returns description-only payloads. */
export function buildDescriptionUpdates(plan: EditorialPlan): DescriptionUpdate[] {
  if (!plan.ok) throw new Error(`FAIL_CLOSED: plan has ${plan.counts.failed} failure(s)`)
  return plan.items
    .filter((i) => i.action === "update")
    .map((i) => ({ id: i.product_id, data: { [EDITORIAL_COPY_FIELD]: i.after } }))
}

export type VerifyFailure = {
  product_id: string
  handle: string
  code: "missing_after_write" | "duplicate_after_write" | "handle_changed" | "value_mismatch"
}

/** Post-write check: every planned row must come back exactly once, same handle, exact value. */
export function verifyAfterWrite(plan: EditorialPlan, live: LiveProductRow[]): VerifyFailure[] {
  const seen = new Map<string, number>()
  for (const row of live) seen.set(row.id, (seen.get(row.id) ?? 0) + 1)
  const byId = new Map(live.map((r) => [r.id, r]))
  const failures: VerifyFailure[] = []
  for (const item of plan.items) {
    const base = { product_id: item.product_id, handle: item.handle }
    const count = seen.get(item.product_id) ?? 0
    const cur = byId.get(item.product_id)
    if (count === 0 || !cur) failures.push({ ...base, code: "missing_after_write" })
    else if (count > 1) failures.push({ ...base, code: "duplicate_after_write" })
    else if (cur.handle !== item.handle) failures.push({ ...base, code: "handle_changed" })
    else if ((typeof cur.description === "string" ? cur.description : null) !== item.after) {
      failures.push({ ...base, code: "value_mismatch" })
    }
  }
  return failures
}

/** Rollback for exactly the rows this plan will change (noops have nothing to restore). */
export function buildRollbackArtifact(
  plan: EditorialPlan,
  meta: { packet_id: string; packet_sha256: string }
): EditorialRollbackArtifact {
  if (!plan.ok) throw new Error("FAIL_CLOSED: refusing rollback artifact for a failed plan")
  return {
    artifact_version: EDITORIAL_COPY_ROLLBACK_VERSION,
    packet_id: meta.packet_id,
    packet_sha256: meta.packet_sha256,
    field: EDITORIAL_COPY_FIELD,
    items: plan.items
      .filter((i) => i.action === "update")
      .map((i) => ({
        product_id: i.product_id,
        handle: i.handle,
        restore_description: i.before,
        expected_current_sha256: sha256Text(i.after),
      })),
  }
}
