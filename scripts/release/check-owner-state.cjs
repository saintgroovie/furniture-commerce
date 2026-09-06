#!/usr/bin/env node
/**
 * Check ACTIVE_OWNER.json vs ACTIVE-RUNTIME-OWNER.txt agreement (read-only).
 * Requires explicit Dokploy ownership on both sides and digest/SHA parity.
 */
const fs = require("fs")
const path = require("path")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/

function parseTxt(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function hasDokploy(s) {
  return /\bdokploy\b/i.test(String(s || ""))
}

const COMPETING = /\b(nightly|systemd|cron|launchagent|compose-only|manual_compose)\b/i

function hasCompeting(s) {
  return COMPETING.test(String(s || ""))
}

function check(json, txt, errors) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    errors.push("json missing")
    return
  }
  if (!txt || typeof txt !== "object") {
    errors.push("txt missing")
    return
  }

  const jController = String(json.allowed_controller || "")
  const jOwner = String(json.owner || "")
  const tOwner = String(txt.runtime_owner || "")
  const tController = String(txt.allowed_controller || "")

  if (!tOwner) errors.push("txt runtime_owner required")
  if (!jController) errors.push("json allowed_controller required")
  if (!jOwner) errors.push("json owner required")

  // Authoritative fields must be Dokploy-based; substring presence alone is not enough
  // if a competing controller is also named.
  if (!hasDokploy(jOwner)) {
    errors.push(`json.owner must be Dokploy (got ${jOwner || "(empty)"})`)
  }
  if (!hasDokploy(jController)) {
    errors.push(`json.allowed_controller must include Dokploy (got ${jController || "(empty)"})`)
  }
  if (!hasDokploy(tOwner)) {
    errors.push(`txt.runtime_owner must be Dokploy (got ${tOwner || "(empty)"})`)
  }
  if (tController && !hasDokploy(tController)) {
    errors.push(`txt.allowed_controller must include Dokploy (got ${tController})`)
  }

  for (const [label, val] of [
    ["json.owner", jOwner],
    ["json.allowed_controller", jController],
    ["txt.runtime_owner", tOwner],
    ["txt.allowed_controller", tController],
  ]) {
    if (hasCompeting(val)) {
      errors.push(`competing controller in ${label}: ${val}`)
    }
  }

  if (tOwner && jOwner && tOwner.toLowerCase() !== jOwner.toLowerCase()) {
    // allow Dokploy vs Dokploy+… only when both are Dokploy and neither is competing
    if (!(hasDokploy(tOwner) && hasDokploy(jOwner))) {
      errors.push(`owner mismatch json=${jOwner} txt=${tOwner}`)
    }
  }

  const jSha = json.desired_git_sha || json.release_sha
  const tSha = txt.desired_git_sha
  if (!jSha || !tSha) errors.push("desired_git_sha missing on json or txt")
  else if (!SHA_RE.test(jSha) || !SHA_RE.test(tSha)) errors.push("desired_git_sha must be 40-char hex")
  else if (jSha !== tSha) errors.push(`desired_git_sha mismatch json=${jSha} txt=${tSha}`)

  const jDig = json.running_storefront_digest || json.desired_registry_digest || json.running_digest
  const tDig = txt.desired_registry_digest
  if (!jDig || !tDig) errors.push("storefront digest required on both json and txt")
  else if (!DIGEST_RE.test(jDig) || !DIGEST_RE.test(tDig)) errors.push("storefront digest must be sha256:…")
  else if (jDig !== tDig) errors.push(`storefront digest mismatch json=${jDig} txt=${tDig}`)

  const jBe = json.running_backend_digest || json.backend_desired_registry_digest
  const tBe = txt.backend_desired_registry_digest
  if (!jBe || !tBe) errors.push("backend digest required on both json and txt")
  else if (!DIGEST_RE.test(jBe) || !DIGEST_RE.test(tBe)) errors.push("backend digest must be sha256:…")
  else if (jBe !== tBe) errors.push(`backend digest mismatch json=${jBe} txt=${tBe}`)
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const name of fs.readdirSync(dir)) {
      const sub = path.join(dir, name)
      if (!fs.statSync(sub).isDirectory()) continue
      const json = JSON.parse(fs.readFileSync(path.join(sub, "ACTIVE_OWNER.json"), "utf8"))
      const txt = parseTxt(fs.readFileSync(path.join(sub, "ACTIVE-RUNTIME-OWNER.txt"), "utf8"))
      const errors = []
      check(json, txt, errors)
      const shouldFail = name.startsWith("neg-")
      const ok = errors.length === 0
      const pass = shouldFail ? !ok : ok
      console.log(`${pass ? "PASS" : "FAIL"} ${name} ${errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }

  let jsonPath, txtPath
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") jsonPath = args[++i]
    if (args[i] === "--txt") txtPath = args[++i]
  }
  if (!jsonPath || !txtPath) {
    console.error("usage: check-owner-state.cjs --json <f> --txt <f> | --fixture-dir <d>")
    process.exit(2)
  }
  const errors = []
  check(JSON.parse(fs.readFileSync(jsonPath, "utf8")), parseTxt(fs.readFileSync(txtPath, "utf8")), errors)
  if (errors.length) {
    console.error("OWNER_CONFLICT", errors.join("\n"))
    process.exit(1)
  }
  console.log("OK owner state agree")
}

main()
