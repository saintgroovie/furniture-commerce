#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { decisionKey } = require("./decision-key.cjs")

function ensureWorkspace(workspace, packetDir) {
  fs.mkdirSync(workspace, { recursive: true })
  const identitySrc = path.join(packetDir, "source-identity.json")
  const destIdentity = path.join(workspace, "source-identity.json")
  if (fs.existsSync(identitySrc) && !fs.existsSync(destIdentity)) {
    fs.copyFileSync(identitySrc, destIdentity)
  }
  if (!fs.existsSync(path.join(workspace, "decisions.json"))) {
    writeAtomic(path.join(workspace, "decisions.json"), {
      version: 1,
      decisions: {},
      history: [],
      created_at: new Date().toISOString(),
    })
  }
  if (!fs.existsSync(path.join(workspace, "history.jsonl"))) {
    fs.writeFileSync(path.join(workspace, "history.jsonl"), "")
  }
}

function loadState(workspace) {
  const p = path.join(workspace, "decisions.json")
  const raw = JSON.parse(fs.readFileSync(p, "utf8"))
  return {
    decisions: raw.decisions || {},
    history: raw.history || [],
    version: raw.version || 1,
  }
}

function saveState(workspace, state) {
  const p = path.join(workspace, "decisions.json")
  if (fs.existsSync(p)) {
    const bak = `${p}.bak.${Date.now()}`
    fs.copyFileSync(p, bak)
  }
  const payload = {
    version: state.version || 1,
    updated_at: new Date().toISOString(),
    decisions: state.decisions,
    history: state.history,
  }
  writeAtomic(p, payload)
  exportArtifacts(workspace, state)
}

function writeAtomic(file, obj) {
  const tmp = `${file}.tmp.${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n")
  fs.renameSync(tmp, file)
}

function appendHistoryEvent(workspace, state, event) {
  state.history.push(event)
  fs.appendFileSync(path.join(workspace, "history.jsonl"), JSON.stringify(event) + "\n")
}

function applyDecision(workspace, payload, packetChecksum) {
  const state = loadState(workspace)
  const {
    product_id,
    field,
    decision,
    status,
    owner_comment,
    reviewer,
    current_value,
    proposed_value,
    chosen_value,
    after_value,
    bucket,
    source_fingerprint,
  } = payload
  if (!product_id || !field || !bucket) throw new Error("product_id, bucket and field required")
  if (!decision && !status) throw new Error("decision required; blank is pending")
  if (!source_fingerprint) throw new Error("source_fingerprint required")

  if (payload.also_set_collection || payload.also_set_category) {
    throw new Error("independent_fields_violation")
  }

  const key = decisionKey(product_id, bucket, field)
  const previous = state.decisions[key] || { status: "pending" }
  const nextStatus = mapStatus(decision, status)
  const next = {
    product_id,
    field,
    bucket,
    current_value: current_value ?? previous.current_value ?? null,
    proposed_value: proposed_value ?? previous.proposed_value ?? null,
    chosen_value: chosen_value ?? null,
    after_value: after_value ?? chosen_value ?? null,
    decision,
    status: nextStatus,
    owner_comment: owner_comment || "",
    reviewed_at: new Date().toISOString(),
    reviewer: reviewer || "owner",
    source_fingerprint,
    automatic_apply_allowed: false,
  }

  if (nextStatus === "auto_deferred_no_image") {
    next.automatic_apply_allowed = false
    next.confirms_product_fields = false
  }

  state.decisions[key] = next
  appendHistoryEvent(workspace, state, {
    ts: new Date().toISOString(),
    event_type: "decision",
    decision_key: key,
    product_id,
    bucket,
    field,
    previous_state: previous,
    next_state: next,
    actor: next.reviewer,
    packet_checksum: packetChecksum,
  })
  saveState(workspace, state)
  return state
}

function undoLast(workspace) {
  const state = loadState(workspace)
  if (!state.history.length) return state
  const undone = new Set()
  let idx = -1
  for (let i = state.history.length - 1; i >= 0; i--) {
    const ev = state.history[i]
    if (ev.event_type === "undo" && typeof ev.undoes_index === "number") {
      undone.add(ev.undoes_index)
      continue
    }
    if ((ev.event_type === "decision" || ev.event_type === "auto_defer_no_image") && !undone.has(i)) {
      idx = i
      break
    }
  }
  if (idx < 0) return state
  const last = state.history[idx]
  const bucket =
    last.bucket || (last.next_state && last.next_state.bucket) || (last.previous_state && last.previous_state.bucket)
  const key = last.decision_key || decisionKey(last.product_id, bucket, last.field)
  const restored = last.previous_state || { status: "pending" }
  const previous = state.decisions[key]
  if (restored.status === "pending" && !restored.decision) {
    delete state.decisions[key]
  } else {
    state.decisions[key] = restored
  }
  appendHistoryEvent(workspace, state, {
    ts: new Date().toISOString(),
    event_type: "undo",
    decision_key: key,
    product_id: last.product_id,
    bucket,
    field: last.field,
    undoes_index: idx,
    previous_state: previous,
    next_state: restored,
    actor: "owner-undo",
    packet_checksum: last.packet_checksum || null,
  })
  saveState(workspace, state)
  return state
}

function mapStatus(decision, status) {
  if (status) return status
  const map = {
    approve_proposed_category: "approved",
    choose_other_category: "approved",
    intentionally_uncategorized: "intentionally_unassigned",
    assign_proposed_collection: "approved",
    choose_other_collection: "approved",
    intentionally_unassigned: "intentionally_unassigned",
    legacy_or_paused: "approved",
    defer: "deferred",
    needs_more_evidence: "needs_more_evidence",
    reject_proposal: "rejected",
    pure_mirror_accessory: "approved",
    furniture_with_mirror: "approved",
    other: "approved",
    auto_deferred_no_image: "auto_deferred_no_image",
  }
  return map[decision] || "pending"
}

function exportArtifacts(workspace, state) {
  const decisions = Object.values(state.decisions || {})
  const cat = ["product_id,field,decision,status,current,proposed,reviewer,comment"]
  const col = [...cat]
  const mir = [...cat]
  const def = [...cat]
  for (const d of decisions) {
    const line = [
      d.product_id,
      d.field,
      d.decision,
      d.status,
      csv(d.current_value),
      csv(d.proposed_value),
      csv(d.reviewer),
      csv(d.owner_comment),
    ].join(",")
    if (d.field === "category") cat.push(line)
    else if (d.field === "collection") col.push(line)
    else if (d.field === "mirror_classification") mir.push(line)
    if (d.status === "deferred" || d.status === "auto_deferred_no_image") def.push(line)
  }
  fs.writeFileSync(path.join(workspace, "category-decisions.csv"), cat.join("\n") + "\n")
  fs.writeFileSync(path.join(workspace, "collection-decisions.csv"), col.join("\n") + "\n")
  fs.writeFileSync(path.join(workspace, "mirror-decisions.csv"), mir.join("\n") + "\n")
  fs.writeFileSync(path.join(workspace, "deferred.csv"), def.join("\n") + "\n")
  fs.writeFileSync(path.join(workspace, "engineering-only.csv"), "engineering_dto_gaps_excluded_from_mutations\n")

  const files = [
    "source-identity.json",
    "decisions.json",
    "category-decisions.csv",
    "collection-decisions.csv",
    "mirror-decisions.csv",
    "deferred.csv",
    "engineering-only.csv",
    "history.jsonl",
  ]
  const lines = []
  for (const f of files) {
    const p = path.join(workspace, f)
    if (!fs.existsSync(p)) continue
    const h = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")
    lines.push(`${h}  ${f}`)
  }
  fs.writeFileSync(path.join(workspace, "checksums.sha256"), lines.join("\n") + "\n")
}

function csv(v) {
  if (v == null) return ""
  const s = String(v).replace(/"/g, '""')
  return `"${s}"`
}

module.exports = {
  ensureWorkspace,
  loadState,
  saveState,
  applyDecision,
  undoLast,
  exportArtifacts,
  appendHistoryEvent,
}
