#!/usr/bin/env node
/**
 * Fidelity: Backend fidelity CI install uses registry.npmjs.org (not yarnpkg default).
 *
 * Guards the Woodright incident where PR #167 Backend fidelity failed on
 * registry.yarnpkg.com HTTP 429 during yarn install (attempts 1–3).
 *
 * Invoked from PR checks release-governance job (plain node, no yarn dlx).
 *
 *   node scripts/release/backend-ci-registry.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const workflowPath = path.join(root, ".github/workflows/pr-checks.yml")
const storefrontYarnrc = path.join(root, "apps/storefront/.yarnrc.yml")
const backendYarnrc = path.join(root, "apps/backend/.yarnrc.yml")
const bakeWorkflow = path.join(root, ".github/workflows/build-staging-images.yml")

let failed = 0
function check(cond, msg) {
  if (cond) {
    console.log("PASS", msg)
  } else {
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

check(Boolean(backend), "backend-fidelity job present in pr-checks.yml")
check(/name:\s*Backend fidelity tests/.test(backend), "required check name Backend fidelity tests preserved")
check(/yarn install --immutable/.test(backend), "backend install uses yarn install --immutable")
check(!/--no-immutable|--mode=update-lockfile|yarn up\b/.test(backend), "backend install has no lockfile-update flags")

// Registry override must be on the Install step path for backend-fidelity.
check(
  /YARN_NPM_REGISTRY_SERVER:\s*https:\/\/registry\.npmjs\.org/.test(backend),
  "backend-fidelity sets YARN_NPM_REGISTRY_SERVER to https://registry.npmjs.org"
)
// Allow explanatory comments; forbid pinning yarnpkg as the active registry value.
check(
  !/YARN_NPM_REGISTRY_SERVER:\s*https:\/\/registry\.yarnpkg\.com/.test(backend) &&
    !/npmRegistryServer:\s*https:\/\/registry\.yarnpkg\.com/.test(backend),
  "backend-fidelity does not set active registry to yarnpkg"
)

// Ensure the env is associated with install (same job; Install step nearby).
{
  const installIdx = backend.indexOf("yarn install --immutable")
  const envIdx = backend.indexOf("YARN_NPM_REGISTRY_SERVER")
  check(installIdx >= 0 && envIdx >= 0 && Math.abs(installIdx - envIdx) < 400, "registry env sits next to backend Install step")
}

// No broad retry loops that would hide non-network yarn failures.
check(!/for\s+\w+\s+in\s+\{1\.\./.test(backend), "backend-fidelity has no shell retry loop")
check(!/until\s+yarn\s+install/.test(backend), "backend-fidelity has no until-yarn-install retry")

// Storefront left unchanged by this hardening (incident was Backend-only).
check(/yarn install --immutable/.test(storefront), "storefront still uses yarn install --immutable")
check(!/YARN_NPM_REGISTRY_SERVER/.test(storefront), "storefront job does not set YARN_NPM_REGISTRY_SERVER")

// Image bake workflow not modified by this contract.
if (fs.existsSync(bakeWorkflow)) {
  const bake = fs.readFileSync(bakeWorkflow, "utf8")
  check(!/YARN_NPM_REGISTRY_SERVER:\s*https:\/\/registry\.npmjs\.org/.test(bake), "bake workflow not carrying this Backend CI registry override")
}

// Repo yarnrc not rewritten to force npmjs (developer/bake blast radius).
for (const [label, p] of [
  ["backend", backendYarnrc],
  ["storefront", storefrontYarnrc],
]) {
  if (!fs.existsSync(p)) continue
  const y = fs.readFileSync(p, "utf8")
  check(!/npmRegistryServer:\s*https:\/\/registry\.npmjs\.org/.test(y), `${label} .yarnrc.yml does not force npmRegistryServer npmjs`)
  check(!/npmRegistryServer:\s*['"]?https:\/\/registry\.yarnpkg\.com/.test(y), `${label} .yarnrc.yml does not hardcode yarnpkg`)
}

// No hardcoded secrets in the workflow change surface.
check(!/\b(ghp_|github_pat_|npm_[A-Za-z0-9]{20,}|\/\/.*:_authToken=)/.test(backend), "backend-fidelity has no auth token literals")

// Release governance still invokes this fidelity test.
check(
  /backend-ci-registry\.fidelity\.test\.cjs/.test(release) || /backend-ci-registry\.fidelity\.test\.cjs/.test(text),
  "release-governance runs backend-ci-registry.fidelity.test.cjs"
)

if (failed > 0) {
  console.error(`backend-ci-registry.fidelity: ${failed} failure(s)`)
  process.exit(1)
}
console.log("backend-ci-registry.fidelity: ok")
