#!/usr/bin/env node

const { decisionKey } = require("./decision-key.cjs")

const APPROVED_STATUSES = new Set(["approved"])
const EXCLUDED = new Set([
  "pending",
  "proposed",
  "rejected",
  "deferred",
  "needs_more_evidence",
  "auto_deferred_no_image",
  "intentionally_unassigned",
])

/**
 * Build future mutation preview from owner decisions only.
 * Never invents approvals from proposals.
 */
function buildMutationPreview(rows, decisions, source) {
  const mutations = []
  const excluded = { pending: 0, rejected: 0, deferred: 0, engineering: 0, other: 0 }

  for (const row of rows) {
    const fields = fieldKeys(row)
    for (const field of fields) {
      const key = decisionKey(row.product_id, row.bucket, field)
      const d = decisions[key]
      if (!d || !d.status || d.status === "pending" || d.status === "proposed") {
        excluded.pending++
        continue
      }
      if (d.status === "rejected") {
        excluded.rejected++
        continue
      }
      if (d.status === "deferred" || d.status === "auto_deferred_no_image" || d.status === "needs_more_evidence") {
        excluded.deferred++
        continue
      }
      if (d.status === "intentionally_unassigned") {
        if (!d.after_value && !mutationAfter(d, field)) {
          excluded.other++
          continue
        }
      }

      if (d.status !== "approved") {
        excluded.other++
        continue
      }

      const before =
        d.current_value ??
        (field === "category" ? row.current_category : field === "collection" ? row.current_collection : row.current_value)
      const after = mutationAfter(d, field) ?? d.proposed_value
      if (after === undefined || after === null || after === "") {
        excluded.other++
        continue
      }
      if (!d.source_fingerprint) {
        excluded.other++
        continue
      }

      mutations.push({
        product_id: row.product_id,
        handle: row.handle,
        bucket: row.bucket,
        field,
        before,
        after,
        rollback_value: before,
        source_fingerprint: d.source_fingerprint,
        owner_decision_ref: key,
        decision: d.decision,
        reviewer: d.reviewer || null,
        reviewed_at: d.reviewed_at || null,
        authorized_for_apply: false,
        marker: "not_authorized_for_apply",
      })
    }
  }

  if (mutations.length === 0) {
    return {
      result: "no_approved_mutations",
      ok: true,
      approved_count: 0,
      mutations: [],
      excluded,
      source,
      note: "PASS: empty approved set is a no-op, not an error",
    }
  }

  return {
    result: "preview_only",
    ok: true,
    approved_count: mutations.length,
    mutations,
    excluded,
    source,
    authorized_for_apply: false,
    marker: "not_authorized_for_apply",
  }
}

function fieldKeys(row) {
  if (row.field_keys) return row.field_keys
  if (row.bucket === "category_gap" || row.bucket === "title_fallback") return ["category"]
  if (row.bucket === "collection_missing" || row.bucket === "collection_null") return ["collection"]
  if (row.bucket === "ambiguous_mirror") return ["mirror_classification"]
  return []
}

function mutationAfter(d, field) {
  if (d.after_value != null) return d.after_value
  if (d.chosen_value != null) return d.chosen_value
  if (d.decision === "approve_proposed_category" || d.decision === "assign_proposed_collection") {
    return d.proposed_value
  }
  if (String(d.decision || "").startsWith("choose_other")) return d.chosen_value || d.proposed_value
  if (d.decision === "intentionally_uncategorized") return null
  if (d.decision === "intentionally_unassigned") return null
  if (d.decision === "legacy_or_paused") return d.current_value
  if (d.decision === "pure_mirror_accessory") return "pure_mirror_accessory"
  if (d.decision === "furniture_with_mirror") return "furniture_with_mirror"
  return undefined
}

/** Blank / missing decision must never count as approval */
function isBlankPending(decision) {
  if (decision == null) return true
  if (decision === "") return true
  if (typeof decision === "object") {
    if (!decision.status || decision.status === "pending" || decision.status === "proposed") return true
    if (!decision.decision || decision.decision === "") return true
  }
  return false
}

function blankInterpretedAsApproval(decision) {
  if (!isBlankPending(decision)) return false
  return decision && decision.status === "approved" && (!decision.decision || decision.decision === "")
}

module.exports = {
  buildMutationPreview,
  isBlankPending,
  blankInterpretedAsApproval,
  APPROVED_STATUSES,
  EXCLUDED,
}
