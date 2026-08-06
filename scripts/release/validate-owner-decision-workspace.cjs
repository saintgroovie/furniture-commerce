#!/usr/bin/env node
/**
 * Gates BR–CE: owner decision workspace + disposable Dokploy negative-test policy.
 */
const fs = require("fs")
const path = require("path")
const {
  buildMutationPreview,
  isBlankPending,
  blankInterpretedAsApproval,
} = require("../../tools/catalog-owner-decision-workspace/lib/mutation-preview.cjs")
const { classifyMedia } = require("../../tools/catalog-owner-decision-workspace/lib/media-classify.cjs")
const { validatePacket } = require("../../tools/catalog-owner-decision-workspace/lib/packet-validate.cjs")

function fail(code, msg) {
  return { ok: false, code, errors: [msg] }
}
function pass(code) {
  return { ok: true, code, errors: [] }
}

function evaluateBR(doc) {
  // Packet source identity
  if (!doc.source_checksum_sha256) return fail("BR", "missing checksum")
  if (!doc.source_bundle_id) return fail("BR", "wrong bundle")
  const ids = (doc.rows || []).map((r) => `${r.product_id}::${r.bucket}`)
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) return fail("BR", "duplicate product IDs")
    seen.add(id)
  }
  // Workspace decision keys must include bucket to avoid category_gap/title_fallback collapse
  const decisionKeys = new Set()
  for (const r of doc.rows || []) {
    const field =
      r.field ||
      (r.bucket === "category_gap" || r.bucket === "title_fallback"
        ? "category"
        : r.bucket === "ambiguous_mirror"
          ? "mirror_classification"
          : "collection")
    const dk = `${r.product_id}::${r.bucket}::${field}`
    if (decisionKeys.has(dk)) return fail("BR", "duplicate decision keys")
    decisionKeys.add(dk)
  }
  if (doc.decision_key_omits_bucket === true) return fail("BR", "duplicate decision keys")
  return pass("BR")
}

function evaluateBS(doc) {
  for (const row of doc.rows || []) {
    if (blankInterpretedAsApproval(row.decision_state || row.owner_decision_obj)) {
      return fail("BS", "blank interpreted approval")
    }
    if (row.blank_means_approved === true) return fail("BS", "blank interpreted approval")
    if (row.owner_decision === "" || row.owner_decision == null) {
      if (row.status === "approved") return fail("BS", "blank interpreted approval")
    }
  }
  if (doc.expect_blank_pending === true) {
    if (!isBlankPending(doc.sample_blank)) return fail("BS", "blank pending required")
  }
  return pass("BS")
}

function evaluateBT(doc) {
  for (const row of doc.rows || []) {
    if (row.category_approval_sets_collection === true) {
      return fail("BT", "category approval changes collection automatically")
    }
    if (row.linked_mutation === true && !row.link_evidence) {
      return fail("BT", "category approval changes collection automatically")
    }
  }
  return pass("BT")
}

function evaluateBU(doc) {
  const preview = doc.mutation_preview || buildMutationPreview(doc.rows || [], doc.decisions || {}, doc.source || {})
  for (const m of preview.mutations || []) {
    if (m.bucket === "engineering_dto" || m.engineering_only === true) {
      return fail("BU", "DTO gap enters mutation preview")
    }
  }
  if (doc.engineering_in_preview === true) return fail("BU", "DTO gap enters mutation preview")
  return pass("BU")
}

function evaluateBV(doc) {
  for (const row of doc.rows || []) {
    const media = row.media || classifyMedia(row)
    if (media.status === "confirmed_no_image") {
      if (row.auto_defer !== true && row.expected_auto_defer !== false) {
        // fixture may assert expected_auto_defer
      }
      if (row.expected_auto_defer === true && row.auto_defer !== true) {
        return fail("BV", "confirmed no image must auto-defer")
      }
      if (row.defer_confirms_fields === true) return fail("BV", "defer confirms fields")
    }
    if (media.status === "ambiguous_media_binding" && row.auto_defer === true) {
      return fail("BV", "ambiguous media must not auto-defer")
    }
  }
  return pass("BV")
}

function evaluateBW(doc) {
  if (doc.state_overwritten_without_audit === true) {
    return fail("BW", "state overwritten without audit event")
  }
  if (doc.undo_appends_event === false) return fail("BW", "undo must append event")
  const history = doc.history || []
  if (doc.require_undo_event) {
    if (!history.some((h) => h.event_type === "undo")) return fail("BW", "undo append event missing")
  }
  return pass("BW")
}

function evaluateBX(doc) {
  const text = doc.review_source_text || ""
  if (/https?:\/\/[^"'\\s]+\/(admin|store)\/[^\s"']+/i.test(text) && /\b(POST|PATCH|PUT|DELETE)\b/.test(text)) {
    return fail("BX", "review code contains production write")
  }
  if (doc.contains_production_write === true) return fail("BX", "review code contains production write")
  return pass("BX")
}

function evaluateBY(doc) {
  const preview = doc.mutation_preview || buildMutationPreview(doc.rows || [], doc.decisions || {}, doc.source || {})
  if ((doc.approved_count === 0 || Object.keys(doc.decisions || {}).length === 0) && doc.force_empty) {
    if (preview.result !== "no_approved_mutations") return fail("BY", "zero approvals must no-op")
  }
  for (const m of preview.mutations || []) {
    const d = (doc.decisions || {})[m.owner_decision_ref]
    if (!d || d.status !== "approved") return fail("BY", "non-approved included")
  }
  if (doc.include_pending_in_preview === true) return fail("BY", "pending excluded")
  if (doc.include_rejected_in_preview === true) return fail("BY", "rejected excluded")
  if (doc.include_deferred_in_preview === true) return fail("BY", "deferred excluded")
  return pass("BY")
}

function evaluateBZ(doc) {
  for (const m of doc.mutations || []) {
    if (!m.product_id || m.target_by_title_only === true) {
      return fail("BZ", "title-only mutation target")
    }
    if (!m.source_fingerprint) {
      return fail("BZ", "exact product ID/fingerprint required")
    }
  }
  if (doc.allow_null_fingerprint === true) {
    return fail("BZ", "exact product ID/fingerprint required")
  }
  return pass("BZ")
}

function evaluateCA(doc) {
  const app = doc.disposable_app || {}
  if (app.public_domain) return fail("CA", "test app with public domain")
  if (app.live_volume_mount === true) return fail("CA", "live volume mount")
  if (app.secret_env === true) return fail("CA", "secret env")
  if (app.image && !String(app.image).includes("@sha256:") && app.pinned !== true) {
    return fail("CA", "pinned harmless image required")
  }
  return pass("CA")
}

function evaluateCB(doc) {
  if (doc.test_only_closure_reported_as_live === true) {
    return fail("CB", "test-only closure reported as live closure")
  }
  if (doc.claim_bypass_closed_live === true && doc.live_rollout_done !== true) {
    return fail("CB", "test-only closure reported as live closure")
  }
  return pass("CB")
}

function evaluateCC(doc) {
  if (doc.deleted_unowned_resource === true) return fail("CC", "deleting unowned resource")
  if (doc.deleted_own_disposable === false && doc.cleanup_attempted === true) {
    return fail("CC", "deleting own disposable app required")
  }
  return pass("CC")
}

function evaluateCD(doc) {
  if (doc.e34388f_stopped_before_review_date === true) {
    return fail("CD", "e34388f stop before review date")
  }
  return pass("CD")
}

function evaluateCE(doc) {
  if (doc.proposal_called_approval === true) return fail("CE", "proposal called approval")
  if (doc.auto_defer_called_classification_approval === true) {
    return fail("CE", "auto-defer called classification approval")
  }
  if (doc.mutation_preview_called_apply === true) return fail("CE", "mutation preview called apply")
  if (doc.test_bypass_called_live_closure === true) return fail("CE", "test bypass closure called live closure")
  if (doc.early_candidate_cleanup_called_authorized === true) {
    return fail("CE", "early candidate cleanup called authorized")
  }
  return pass("CE")
}

const GATES = {
  BR: evaluateBR,
  BS: evaluateBS,
  BT: evaluateBT,
  BU: evaluateBU,
  BV: evaluateBV,
  BW: evaluateBW,
  BX: evaluateBX,
  BY: evaluateBY,
  BZ: evaluateBZ,
  CA: evaluateCA,
  CB: evaluateCB,
  CC: evaluateCC,
  CD: evaluateCD,
  CE: evaluateCE,
}

function evaluateAll(doc) {
  const results = {}
  const errors = []
  for (const [code, fn] of Object.entries(GATES)) {
    const r = fn(doc)
    results[code] = r
    if (!r.ok) errors.push(...r.errors.map((e) => `${code}: ${e}`))
  }
  return { ok: errors.length === 0, errors, results }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      const gate = (doc.gate || "ALL").toUpperCase()
      let r
      if (gate === "ALL") r = evaluateAll(doc)
      else if (GATES[gate]) {
        const one = GATES[gate](doc)
        r = { ok: one.ok, errors: one.errors, results: { [gate]: one } }
      } else {
        r = { ok: false, errors: [`unknown gate ${gate}`] }
      }
      const shouldFail = f.startsWith("neg-")
      const passOk = shouldFail ? !r.ok : r.ok
      console.log(`${passOk ? "PASS" : "FAIL"} ${f} ${(r.errors || []).join("; ")}`)
      if (!passOk) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (args[0] === "--packet-dir") {
    const r = validatePacket(args[1])
    if (!r.ok) {
      console.error("INVALID", r.errors.join("; "))
      process.exit(1)
    }
    console.log("OK packet", r.packet_id)
    process.exit(0)
  }
  if (!args[0]) {
    console.error("usage: validate-owner-decision-workspace.cjs --fixture-dir <d>|--packet-dir <d>")
    process.exit(2)
  }
  const doc = JSON.parse(fs.readFileSync(args[0], "utf8"))
  const r = evaluateAll(doc)
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK owner-decision-workspace gates BR–CE")
}

module.exports = { evaluateAll, GATES }
if (require.main === module) main()
