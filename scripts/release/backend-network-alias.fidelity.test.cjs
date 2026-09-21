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

const attach = readFileSync(
  join(root, "scripts/release/attach-backend-network-alias.sh"),
  "utf8"
)
assert.match(attach, /EMERGENCY_BACKEND_ALIAS=1/)
assert.match(attach, /NOT durable|non-durable|EMERGENCY ONLY/)
assert.match(attach, /must not be attached to Traefik\/dokploy/)

const recreate = readFileSync(
  join(root, "ops/release/recreate-staging-backend-with-media.sh"),
  "utf8"
)
assert.match(recreate, /stripped leaked alias backend from \$NET_DOKPLOY/)
assert.doesNotMatch(
  recreate,
  /docker network connect --alias backend "\$NET_DOKPLOY"/
)

const rollback = readFileSync(
  join(root, "ops/release/rollback-staging-backend-from-keeper.sh"),
  "utf8"
)
assert.match(rollback, /stripped leaked alias backend from \$NET_DOKPLOY/)
assert.match(
  rollback,
  /die "dokploy-network inspect (IP|aliases) failed after connect \(refusing start\)"/
)

{
  const script = `
set -euo pipefail
die() { echo "ERROR: $*" >&2; exit 2; }
wr_cutover_docker() {
  if [[ "$1" == inspect ]]; then return 1; fi
  if [[ "$1" == start ]]; then echo STARTED; return 0; fi
  return 0
}
NAME=woodright-staging-backend
NET_DOKPLOY=dokploy-network
if ! _dok_ip="$(wr_cutover_docker inspect -f unused "$NAME")"; then
  die "dokploy-network inspect IP failed after connect (refusing start)"
fi
wr_cutover_docker start "$NAME"
`
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" })
  assert.equal(probe.status, 2, probe.stdout + probe.stderr)
  assert.match(probe.stderr, /refusing start/)
  assert.doesNotMatch(`${probe.stdout}${probe.stderr}`, /STARTED/)
}

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
