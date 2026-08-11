#!/usr/bin/env node
/**
 * Append-only cutover audit log (JSONL) with hash chain.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function hashEvent(prevHash, body) {
  const payload = JSON.stringify({ prev: prevHash || null, body })
  return crypto.createHash("sha256").update(payload).digest("hex")
}

function validateLog(text, errors) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  let prev = null
  const ids = new Set()
  lines.forEach((line, i) => {
    let ev
    try {
      ev = JSON.parse(line)
    } catch (e) {
      errors.push(`line ${i + 1}: malformed JSON`)
      return
    }
    if (!ev.timestamp || !ev.transaction_id || !ev.event || !ev.current_event_hash) {
      errors.push(`line ${i + 1}: missing required fields`)
    }
    if (ids.has(ev.transaction_id + ":" + ev.event + ":" + ev.timestamp)) {
      errors.push(`line ${i + 1}: duplicate event key`)
    }
    ids.add(ev.transaction_id + ":" + ev.event + ":" + ev.timestamp)
    const body = { ...ev }
    const claimed = body.current_event_hash
    const claimedPrev = body.previous_event_hash || null
    delete body.current_event_hash
    delete body.previous_event_hash
    if (claimedPrev !== prev) errors.push(`line ${i + 1}: previous_event_hash mismatch`)
    const calc = hashEvent(prev, body)
    if (calc !== claimed) errors.push(`line ${i + 1}: hash chain broken`)
    prev = claimed
  })
}

function appendEvent(file, event) {
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8")
    if (existing.trim()) {
      const preErrors = []
      validateLog(existing, preErrors)
      if (preErrors.length) {
        throw new Error("refusing append onto corrupt audit log: " + preErrors.join("; "))
      }
    }
  }
  let prev = null
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)
    if (lines.length) {
      const last = JSON.parse(lines[lines.length - 1])
      prev = last.current_event_hash
    }
  }
  const body = { ...event }
  const current = hashEvent(prev, body)
  const row = { ...body, previous_event_hash: prev, current_event_hash: current }
  fs.appendFileSync(file, JSON.stringify(row) + "\n")
  return row
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
      const errors = []
      validateLog(fs.readFileSync(path.join(dir, f), "utf8"), errors)
      const shouldFail = f.startsWith("neg-")
      const ok = errors.length === 0
      const pass = shouldFail ? !ok : ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (args[0] === "--append") {
    const file = args[1]
    const event = JSON.parse(fs.readFileSync(args[2], "utf8"))
    try {
      const row = appendEvent(file, event)
      console.log(JSON.stringify(row))
    } catch (e) {
      console.error(String(e.message || e))
      process.exit(1)
    }
    return
  }
  if (args[0] === "--validate") {
    const errors = []
    validateLog(fs.readFileSync(args[1], "utf8"), errors)
    if (errors.length) {
      console.error("INVALID", errors.join("\n"))
      process.exit(1)
    }
    console.log("OK audit log")
    return
  }
  console.error("usage: validate-cutover-audit-log.cjs --fixture-dir d | --validate f | --append f event.json")
  process.exit(2)
}

module.exports = { hashEvent, validateLog, appendEvent }
if (require.main === module) main()
