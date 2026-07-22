#!/usr/bin/env node
/**
 * Generate ACTIVE-RUNTIME-OWNER.txt from machine-readable active + intents.
 * View only - never invents active identity from pending intents.
 */
const fs = require("fs")

function renderOwnerTxt(active, intentsDoc = { intents: [] }) {
  const pending = (intentsDoc.intents || []).filter((i) =>
    ["planned", "prepared", "approved", "activating", "unknown_pending_forensics"].includes(i.status)
  )
  const lines = [
    `runtime_owner=${active.owner || "Dokploy"}`,
    `bundle_id=${active.bundle_id}`,
    `backend_revision=${active.backend_revision}`,
    `storefront_revision=${active.storefront_revision}`,
    `backend_digest=${active.backend_digest}`,
    `storefront_digest=${active.storefront_digest}`,
    `backend_container_id=${active.backend_container_id}`,
    `storefront_container_id=${active.storefront_container_id}`,
    `activation_mode=${active.activation_mode || ""}`,
    `transaction_or_reconciliation_id=${active.transaction_id || active.reconciliation_id || ""}`,
    `allowed_controller=${active.allowed_controller || "Dokploy"}`,
    `manual_mutation_allowed=${active.manual_mutation_allowed === true}`,
    `dokploy_ui_residual=${active.dokploy_ui_residual !== false}`,
    `claim_bypass_closed=${active.claim_bypass_closed === true}`,
    `pending_intents_count=${pending.length}`,
    `pending_intents=${pending.map((p) => p.intent_id).join(",") || "none"}`,
    `intent_registry_path=${intentsDoc.path || "/srv/woodright/runtime-ownership/INTENTS.json"}`,
    `updated_utc=${active.updated_utc || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`,
    `note=${active.note || "generated_from_active_metadata"}`,
  ]
  return lines.join("\n") + "\n"
}

function main() {
  const args = process.argv.slice(2)
  let activePath = null
  let intentsPath = null
  let out = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--active") activePath = args[++i]
    if (args[i] === "--intents") intentsPath = args[++i]
    if (args[i] === "--out") out = args[++i]
  }
  if (!activePath || !out) {
    console.error("usage: render-active-owner-txt.cjs --active <json> [--intents <json>] --out <txt>")
    process.exit(2)
  }
  const active = JSON.parse(fs.readFileSync(activePath, "utf8"))
  const intents = intentsPath ? JSON.parse(fs.readFileSync(intentsPath, "utf8")) : { intents: [] }
  const text = renderOwnerTxt(active, intents)
  fs.writeFileSync(out, text)
  console.log(JSON.stringify({ ok: true, out, pending_intents_count: (intents.intents || []).filter((i) => ["planned", "prepared", "approved", "activating"].includes(i.status)).length }))
}

module.exports = { renderOwnerTxt }
if (require.main === module) main()
