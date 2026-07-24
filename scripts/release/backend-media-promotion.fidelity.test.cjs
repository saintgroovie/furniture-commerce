/**
 * Fidelity: media promotion gate exists, is non-mutating, and is required
 * before owner manifest reconciliation (documented + assert + reconcile + recreate).
 *
 *   node scripts/release/backend-media-promotion.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const { readFileSync, existsSync } = require("node:fs")
const { join } = require("node:path")

const root = process.cwd()
const gate = join(root, "ops/release/verify-backend-media-mount.sh")
const assertScript = join(root, "ops/release/assert-manifest-update-allowed.sh")
const reconcile = join(root, "ops/release/reconcile-runtime-manifests.sh")
const recreate = join(root, "ops/release/recreate-staging-backend-with-media.sh")
const discovery = join(root, "ops/lib/woodright-runtime-discovery.sh")
const docs = join(root, "docs/operator/backend-media-promotion-gate.md")
const compose = join(root, "docker-compose.staging.yml")
const health = join(root, "ops/monitoring/woodright-health-check.sh")

for (const p of [gate, assertScript, reconcile, recreate, discovery, docs, compose, health]) {
  assert.equal(existsSync(p), true, `missing ${p}`)
}

const gateTxt = readFileSync(gate, "utf8")
assert.match(gateTxt, /MEDIA_GATE_PASS|ok": true/)
assert.match(gateTxt, /HOST_PORTS_PUBLISHED/)
assert.match(gateTxt, /media_mount/)
assert.doesNotMatch(
  gateTxt,
  /docker\s+(run|create|rm|kill|restart)\b/,
  "gate must not create/remove/restart containers"
)
assert.doesNotMatch(gateTxt, />\s*\/srv\/woodright\/runtime-ownership\/ACTIVE_OWNER/)
assert.doesNotMatch(gateTxt, />\s*\/srv\/woodright\/runtime-ownership\/EXPECTED_RELEASE/)

const disc = readFileSync(discovery, "utf8")
assert.match(disc, /DISCOVERY_MULTIPLE_MATCH/)
assert.match(disc, /MEDIA_MOUNT_MISSING/)
assert.match(disc, /rollback\|keeper\|candidate\|STOPPED/)
assert.match(disc, /expected_backend_digest_missing|DIGEST_MISMATCH/)

const composeTxt = readFileSync(compose, "utf8")
assert.match(composeTxt, /woodright_staging_media:\/server\/static/)
assert.match(composeTxt, /external:\s*true/)
assert.match(
  composeTxt,
  /name:\s*woodright-stack-3dsdhd_woodright_staging_media/
)

const docsTxt = readFileSync(docs, "utf8")
assert.match(docsTxt, /ACTIVE_OWNER\.json/)
assert.match(docsTxt, /EXPECTED_RELEASE\.json/)
assert.match(docsTxt, /verify-backend-media-mount\.sh/)
assert.match(docsTxt, /reconcile-runtime-manifests\.sh/)
assert.match(docsTxt, /assert-manifest-update-allowed/)

const assertTxt = readFileSync(assertScript, "utf8")
assert.match(assertTxt, /verify-backend-media-mount\.sh/)

const reconcileTxt = readFileSync(reconcile, "utf8")
assert.match(reconcileTxt, /assert-manifest-update-allowed\.sh/)
assert.match(reconcileTxt, /--apply/)
assert.match(reconcileTxt, /bash "\$ASSERT"/)

const recreateTxt = readFileSync(recreate, "utf8")
assert.match(recreateTxt, /verify-backend-media-mount\.sh/)
assert.match(recreateTxt, /MEDIA_PROMOTION_GATE_FAILED/)
assert.match(recreateTxt, /--mount "type=volume,source=\$\{VOLUME\},destination=\$\{DEST\}"/)

const healthTxt = readFileSync(health, "utf8")
assert.match(healthTxt, /wr_discover_backend_container/)
assert.match(healthTxt, /wr_discover_storefront_container/)
assert.doesNotMatch(
  healthTxt,
  /SF_CONTAINER="\$\(wr_discover|BE_CONTAINER="\$\(wr_discover/
)
assert.doesNotMatch(healthTxt, /SF_CONTAINER="woodright-staging-storefront"/)
assert.doesNotMatch(healthTxt, /BE_CONTAINER="woodright-staging-backend"/)
assert.match(healthTxt, /discovery_be/)

// Backup scripts must not keep ephemeral compose defaults
const media = readFileSync(join(root, "ops/backup/woodright-media-backup.sh"), "utf8")
const run = readFileSync(join(root, "ops/backup/woodright-backup-run.sh"), "utf8")
assert.doesNotMatch(media, /woodright-stack-3dsdhd-backend-1/)
assert.doesNotMatch(run, /woodright-stack-3dsdhd-backend-1/)
assert.match(media, /wr_discover_backend_container/)
assert.match(run, /wr_discover_backend_container/)

console.log("backend-media-promotion.fidelity.test.cjs: ok")
