#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")
}

function validatePacket(packetDir) {
  const errors = []
  const warnings = []
  const identityPath = path.join(packetDir, "source-identity.json")
  const decisionsPath = path.join(packetDir, "review-decisions.json")
  if (!fs.existsSync(identityPath)) errors.push("missing_source_identity")
  if (!fs.existsSync(decisionsPath)) errors.push("missing_review_decisions")
  if (errors.length) return { ok: false, errors, warnings }

  const identity = JSON.parse(fs.readFileSync(identityPath, "utf8"))
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf8"))

  if (!identity.packet_id && !decisions.packet_id) errors.push("missing_packet_id")
  if (!identity.source_bundle_id && !decisions.source_bundle_id) errors.push("missing_source_bundle_id")
  if (!identity.source_checksum_sha256 && !decisions.source_checksum_sha256) {
    errors.push("missing_checksum")
  }

  const checksum = decisions.source_checksum_sha256 || identity.source_checksum_sha256
  if (identity.source_checksum_sha256 && decisions.source_checksum_sha256) {
    if (identity.source_checksum_sha256 !== decisions.source_checksum_sha256) {
      errors.push("checksum_mismatch")
    }
  }

  const rows = decisions.rows || []
  // Composite uniqueness: product_id + bucket (+ field implied by bucket)
  const seen = new Set()
  const dups = []
  for (const r of rows) {
    const key = `${r.product_id}::${r.bucket}`
    if (seen.has(key)) dups.push(key)
    seen.add(key)
  }
  if (dups.length) errors.push(`duplicate_composite_keys:${dups.slice(0, 5).join(",")}`)

  // Engineering must not be mixed into owner rows
  const engInOwner = rows.filter((r) => r.bucket === "engineering_dto" || r.owner_queue === false)
  if (engInOwner.length) errors.push("engineering_mixed_into_owner_rows")

  // Auto-approval without evidence forbidden
  for (const r of rows) {
    if (r.status === "approved" || r.automatic_apply_allowed === true) {
      if (!r.owner_approved_at && !r.reviewer) errors.push("automatic_approval_without_evidence")
    }
  }

  const fingerprint_by_id = {}
  const fingerprint_by_row = {}
  for (const r of rows) {
    const fp =
      r.source_fingerprint ||
      crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            id: r.product_id,
            bucket: r.bucket,
            handle: r.handle,
            title: r.title,
            category: r.current_category,
            collection: r.current_collection,
          })
        )
        .digest("hex")
        .slice(0, 16)
    fingerprint_by_id[r.product_id] = fp
    fingerprint_by_row[`${r.product_id}::${r.bucket}`] = fp
  }

  const counts = decisions.counts || {}
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    packet_id: decisions.packet_id || identity.packet_id,
    source_bundle_id: decisions.source_bundle_id || identity.source_bundle_id,
    source_checksum_sha256: checksum,
    row_count: rows.length,
    fingerprint_by_id,
    fingerprint_by_row,
    counts,
    identity_sha256: sha256File(identityPath),
    decisions_sha256: sha256File(decisionsPath),
  }
}

module.exports = { validatePacket, sha256File }
