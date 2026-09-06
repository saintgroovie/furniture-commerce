#!/usr/bin/env node
/**
 * Workflow fidelity: Backend CI install resilience v2 contract.
 *
 *   node scripts/release/backend-ci-install-resilience.fidelity.test.cjs
 */
"use strict"

const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const workflowPath = path.join(root, ".github/workflows/pr-checks.yml")
const helperPath = path.join(root, "scripts/release/yarn-install-network-resilient.cjs")
const bakeWorkflow = path.join(root, ".github/workflows/build-staging-images.yml")

let failed = 0
function check(cond, msg) {
  if (cond) console.log("PASS", msg)
  else {
    console.error("FAIL", msg)
    failed++
  }
}

const text = fs.readFileSync(workflowPath, "utf8")

function jobBlock(name) {
  const startRe = new RegExp(`^  ${name}:\\n`, "m")
  const start = text.search(startRe)
  if (start < 0) return ""
  const rest = text.slice(start + (`  ${name}:\n`).length)
  const next = rest.search(/^  [a-z0-9-]+:\n/m)
  return next < 0 ? text.slice(start) : text.slice(start, start + (`  ${name}:\n`).length + next)
}

const backend = jobBlock("backend-fidelity")
const storefront = jobBlock("storefront")
const release = jobBlock("release-governance")

check(Boolean(backend), "backend-fidelity job present")
check(/name:\s*Backend fidelity tests/.test(backend), "required check name preserved")
check(
  /YARN_NPM_REGISTRY_SERVER:\s*https:\/\/registry\.npmjs\.org/.test(backend),
  "npmjs override retained"
)
check(
  /yarn-install-network-resilient\.cjs/.test(backend),
  "backend Install invokes network-resilient helper"
)
check(
  !/continue-on-error:\s*true/.test(backend),
  "backend-fidelity has no continue-on-error"
)
check(!/for\s+\w+\s+in\s+\{1\.\./.test(backend), "no shell retry loop")
check(!/until\s+yarn\s+install/.test(backend), "no until-yarn-install")

// Cache: explicit berry path or setup-node cache yarn
check(
  (/actions\/cache@/.test(backend) && /yarn\/berry\/cache|\.yarn\/berry\/cache|~\/\.yarn\/berry\/cache/.test(backend)) ||
    (/cache:\s*yarn/.test(backend) && /apps\/backend\/yarn\.lock/.test(backend)),
  "backend yarn cache configured (actions/cache berry path or setup-node cache:yarn)"
)
check(
  /hashFiles\(['"]apps\/backend\/yarn\.lock['"]\)/.test(backend) ||
    /cache-dependency-path:\s*apps\/backend\/yarn\.lock/.test(backend),
  "cache key/path tied to apps/backend/yarn.lock"
)
{
  // Cache step must only restore Yarn Berry package cache — no secrets/runtime paths.
  const cacheIdx = backend.search(/Restore Yarn Berry cache|actions\/cache@/)
  const cacheSlice = cacheIdx >= 0 ? backend.slice(cacheIdx, cacheIdx + 900) : ""
  check(/path:\s*~\/\.yarn\/berry\/cache/.test(cacheSlice), "cache path is ~/.yarn/berry/cache only")
  check(!/\.env\b/.test(cacheSlice), "cache step does not include .env")
  check(!/\bsecrets?\b/i.test(cacheSlice), "cache step does not include secrets paths")
  check(!/postgres|database|\.medusa\/db/i.test(cacheSlice), "cache step does not include DB artifacts")
}

// Tests not wrapped
{
  const testStep = backend.slice(backend.indexOf("Run classification"))
  check(
    !/yarn-install-network-resilient/.test(testStep),
    "fidelity test step not wrapped in install retry helper"
  )
  check(/yarn dlx tsx/.test(testStep) || /fidelity\.test\.ts/.test(testStep), "backend tests still run via yarn dlx tsx")
}

check(/yarn install --immutable/.test(storefront), "storefront install unchanged (immutable)")
check(!/yarn-install-network-resilient/.test(storefront), "storefront does not use install retry helper")
check(!/YARN_NPM_REGISTRY_SERVER/.test(storefront), "storefront has no npmjs override")

if (fs.existsSync(bakeWorkflow)) {
  const bake = fs.readFileSync(bakeWorkflow, "utf8")
  check(!/yarn-install-network-resilient/.test(bake), "image bake workflow unchanged (no helper)")
  check(!/YARN_NPM_REGISTRY_SERVER:\s*https:\/\/registry\.npmjs\.org/.test(bake), "bake no npmjs override from this task")
}

check(fs.existsSync(helperPath), "helper script exists")
{
  const h = fs.readFileSync(helperPath, "utf8")
  check(/yarn install --immutable/.test(h), "helper canonical command is yarn install --immutable")
  check(/classifyInstallFailure/.test(h), "helper has classification")
  check(/maxAttempts|MAX_ATTEMPTS/.test(h), "helper bounds attempts")
  check(/fail_fast|retries_exhausted/.test(h), "helper emits fail_fast / retries_exhausted events")
  check(!/continue-on-error/.test(h), "helper source has no continue-on-error")
  // Must return last install status on failure paths (not force exit 0 after failed install).
  check(/return result\.status/.test(h), "helper preserves install exit status on failure")
  check(!/return 0\s*\n\s*}\s*\n\s*if \(!classification\.retryable\)/.test(h), "helper does not swallow non-retryable as success")
}

check(
  /backend-ci-install-resilience\.fidelity\.test\.cjs/.test(release) ||
    /yarn-install-network-resilient\.fidelity\.test\.cjs/.test(release),
  "release-governance invokes resilience fidelity tests"
)

if (failed > 0) {
  console.error(`backend-ci-install-resilience.fidelity: ${failed} failure(s)`)
  process.exit(1)
}
console.log("backend-ci-install-resilience.fidelity: ok")
