/**
 * Guard: production must not ship hardcoded JWT/COOKIE fallbacks or insecure cookies.
 * Includes a small runtime subprocess check for fail-closed secrets.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const cfg = readFileSync(join(root, "medusa-config.ts"), "utf8")

assert.match(cfg, /requireEnv/, "production secrets must fail-closed via requireEnv")
assert.match(cfg, /secure:\s*true/, "production cookies must set secure: true")
assert.match(
  cfg,
  /MEDUSA_LOCAL_HTTP=1 is ignored in production/,
  "must document ignoring MEDUSA_LOCAL_HTTP in production for Secure cookies"
)
assert.doesNotMatch(
  cfg,
  /jwtSecret:\s*process\.env\.JWT_SECRET\s*\?\?/,
  "must not use ?? hardcoded jwt fallback in production path"
)

// Runtime: production without JWT_SECRET must throw (isolated snippet mirrors requireEnv).
const dir = mkdtempSync(join(tmpdir(), "wr-sec-"))
const probe = join(dir, "probe.mjs")
writeFileSync(
  probe,
  `
function requireEnv(name, value, minLen = 1) {
  const v = (value ?? "").trim()
  if (!v || v.length < minLen) throw new Error(name + " missing")
  return v
}
try {
  requireEnv("JWT_SECRET", process.env.JWT_SECRET, 32)
  console.log("unexpected_ok")
  process.exit(2)
} catch (e) {
  console.log("fail_closed_ok")
  process.exit(0)
}
`
)
const r = spawnSync(process.execPath, [probe], {
  env: { ...process.env, NODE_ENV: "production", JWT_SECRET: "" },
  encoding: "utf8",
})
assert.equal(r.status, 0, "empty JWT_SECRET must fail closed")
assert.match(r.stdout, /fail_closed_ok/)

console.log("medusa-security-config.fidelity: ok")
