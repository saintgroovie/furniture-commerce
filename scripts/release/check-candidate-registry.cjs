#!/usr/bin/env node
/**
 * Validate candidate runtime registry (read-only).
 */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{7,40}$/

function validate(doc, errors, warnings) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push("registry must be object")
    return
  }
  if (doc.schema_version !== "1") errors.push('schema_version must be "1"')
  if (!Array.isArray(doc.candidates)) {
    errors.push("candidates must be array")
    return
  }
  const ports = new Map()
  const now = Date.now()
  for (const c of doc.candidates) {
    if (!c.candidate_id) errors.push("candidate_id required")
    if (!c.owner) errors.push(`${c.candidate_id || "?"}: missing owner`)
    if (!c.task) errors.push(`${c.candidate_id || "?"}: missing task`)
    if (!SHA_RE.test(c.sha || "")) errors.push(`${c.candidate_id || "?"}: malformed sha`)
    if (c.public_route === true) errors.push(`${c.candidate_id}: public_route true forbidden for candidate`)
    if (c.competing_with_live === true) errors.push(`${c.candidate_id}: competing_with_live true`)
    if (c.cleanup_requires_owner_approval !== true && c.status !== "stopped") {
      // soft: prefer approval flag
      if (c.cleanup_requires_owner_approval === false && c.status === "preserved") {
        /* ok if explicit preserved with approval required false? still require approval */
      }
    }
    if (c.cleanup_requires_owner_approval !== true) {
      errors.push(`${c.candidate_id}: cleanup_requires_owner_approval must be true`)
    }
    for (const port of [c.storefront_port, c.backend_port]) {
      if (port == null) continue
      if (ports.has(port)) errors.push(`duplicate port ${port} (${ports.get(port)} vs ${c.candidate_id})`)
      else ports.set(port, c.candidate_id)
    }
    if (c.review_after) {
      const t = Date.parse(c.review_after)
      if (!Number.isNaN(t) && t < now) warnings.push(`${c.candidate_id}: review_after expired (audit required, not auto-delete)`)
    }
  }
}

function runOne(file) {
  const errors = []
  const warnings = []
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    return { file, ok: false, errors: [e.message], warnings }
  }
  validate(doc, errors, warnings)
  return { file, ok: errors.length === 0, errors, warnings }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(
        `${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}${r.warnings.length ? " WARN:" + r.warnings.join("|") : ""}`
      )
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: check-candidate-registry.cjs <file> | --fixture-dir <dir>")
    process.exit(2)
  }
  const r = runOne(args[0])
  for (const w of r.warnings) console.warn("WARN", w)
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK candidate registry")
}

main()
