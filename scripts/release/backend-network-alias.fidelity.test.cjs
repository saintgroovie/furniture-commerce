/**
 * Static + fixture fidelity for public backend Docker DNS alias `backend`.
 *
 *   node scripts/release/backend-network-alias.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const root = process.cwd()
const compose = readFileSync(join(root, "docker-compose.staging.yml"), "utf8")

assert.match(compose, /woodright_staging:\s*\n\s+aliases:\s*\n\s+-\s+backend\b/)
assert.match(compose, /dokploy-network:\s*\{\}/)
assert.match(
  compose,
  /MEDUSA_BACKEND_URL_INTERNAL:-\s*http:\/\/backend:9000/
)

const backendIdx = compose.search(/^  backend:\s*$/m)
assert.ok(backendIdx >= 0, "compose missing backend service")
const nextSvc = compose.slice(backendIdx + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m)
const backendBlock =
  nextSvc < 0
    ? compose.slice(backendIdx)
    : compose.slice(backendIdx, backendIdx + 1 + nextSvc)
assert.doesNotMatch(
  backendBlock,
  /networks:\s*\n\s+-\s+woodright_staging\s*\n\s+-\s+dokploy-network/
)
assert.match(
  backendBlock,
  /woodright_staging:\s*\n\s+aliases:\s*\n\s+-\s+backend\b/
)
const docs = readFileSync(join(root, "docs/operator/dokploy-staging.md"), "utf8")
assert.match(docs, /aliases:\s*\n\s+-\s+backend/)
assert.match(docs, /ENOTFOUND backend|product-static/)

assert.match(
  readFileSync(join(root, "scripts/release/attach-backend-network-alias.sh"), "utf8"),
  /EMERGENCY_BACKEND_ALIAS=1/
)
assert.match(
  readFileSync(join(root, "scripts/release/attach-backend-network-alias.sh"), "utf8"),
  /NOT durable|non-durable|EMERGENCY ONLY/
)

const self = spawnSync(
  process.execPath,
  ["scripts/release/verify-backend-network-alias.cjs", "--self-test"],
  { cwd: root, encoding: "utf8" }
)
assert.equal(self.status, 0, self.stderr || self.stdout)

const fixtures = spawnSync(
  process.execPath,
  [
    "scripts/release/verify-backend-network-alias.cjs",
    "--fixture-dir",
    "scripts/release/fixtures/backend-alias",
  ],
  { cwd: root, encoding: "utf8" }
)
assert.equal(fixtures.status, 0, fixtures.stderr || fixtures.stdout)

const composeOnly = spawnSync(
  process.execPath,
  ["scripts/release/verify-backend-network-alias.cjs"],
  { cwd: root, encoding: "utf8" }
)
assert.equal(composeOnly.status, 0, composeOnly.stderr || composeOnly.stdout)

console.log("backend-network-alias.fidelity.test.cjs: ok")
