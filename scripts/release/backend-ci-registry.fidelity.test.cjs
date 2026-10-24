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
// Canonical immutable install is retained either inline or via CI-only helper.
{
  const helperRef = /yarn-install-network-resilient\.cjs/.test(backend)
  const inlineImmutable = /yarn install --immutable/.test(backend)
  const helperPath = path.join(root, "scripts/release/yarn-install-network-resilient.cjs")
  const helperHasImmutable =
    fs.existsSync(helperPath) &&
    /yarn install --immutable/.test(fs.readFileSync(helperPath, "utf8"))
  check(
    inlineImmutable || (helperRef && helperHasImmutable),
    "backend install uses yarn install --immutable (direct or via resilient helper)"
  )
}
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
  const installIdx = Math.max(
    backend.indexOf("yarn install --immutable"),
    backend.indexOf("yarn-install-network-resilient.cjs")
  )
  const envIdx = backend.indexOf("YARN_NPM_REGISTRY_SERVER")
  check(installIdx >= 0 && envIdx >= 0 && Math.abs(installIdx - envIdx) < 800, "registry env sits next to backend Install step")
}

// No broad shell retry loops that would hide non-network yarn failures.
// (Bounded Node helper classification is allowed; shell for/until loops are not.)
check(!/for\s+\w+\s+in\s+\{1\.\./.test(backend), "backend-fidelity has no shell retry loop")
check(!/until\s+yarn\s+install/.test(backend), "backend-fidelity has no until-yarn-install retry")

// Storefront left unchanged by this hardening (incident was Backend-only).
check(/yarn install --immutable/.test(storefront), "storefront still uses yarn install --immutable")
check(!/YARN_NPM_REGISTRY_SERVER/.test(storefront), "storefront job does not set YARN_NPM_REGISTRY_SERVER")

// Image bake workflow not modified by this contract.

// Parse actual YAML; reject duplicate mapping/job IDs and aliases before loading.
// Ruby/Psych is part of the hosted Ubuntu runner and macOS; no npm install here.
function parseWorkflow(source) {
  const ruby = `require 'psych'; require 'json'
source = STDIN.read
walk = lambda do |node|
  raise 'YAML aliases forbidden' if node.is_a?(Psych::Nodes::Alias)
  if node.is_a?(Psych::Nodes::Mapping)
    seen = {}
    node.children.each_slice(2) do |key, value|
      raise 'Non-scalar mapping key' unless key.is_a?(Psych::Nodes::Scalar)
      raise 'Duplicate or merged mapping key' if seen[key.value] || key.value == '<<'
      seen[key.value] = true
    end
  end
  (node.children || []).each { |child| walk.call(child) } if node.respond_to?(:children)
end
walk.call(Psych.parse_stream(source))
puts JSON.generate(Psych.safe_load(source, permitted_classes: [], permitted_symbols: [], aliases: false))`
  const result = require('node:child_process').spawnSync('ruby', ['-e', ruby], {
    input: source, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || 'YAML parser unavailable')
  const doc = JSON.parse(result.stdout)
  assert.ok(doc && doc.jobs && !Array.isArray(doc.jobs), 'Workflow jobs mapping required')
  for (const [id, job] of Object.entries(doc.jobs)) {
    assert.match(id, /^[A-Za-z_][A-Za-z0-9_-]*$/)
    assert.ok(job && typeof job === 'object' && !Array.isArray(job), 'Unique job object required')
  }
  return doc
}
function imageJobs(doc) {
  const known = new Set(['build', 'qualify-storefront', 'qualify-backend-fidelity', 'qualify-release-governance'])
  assert.ok(Object.keys(doc.jobs).every(id => known.has(id)), 'Unknown image job requires explicit classification')
  assert.ok(doc.jobs.build && Array.isArray(doc.jobs.build.steps), 'Actual build job required')
  const writers = Object.values(doc.jobs).filter(job => (job.steps || []).some(step =>
    /docker\/build-push-action/.test(step.uses || '') || /\bdocker\s+(?:build|push|buildx\s+build)\b/.test(step.run || '')))
  assert.ok(writers.includes(doc.jobs.build), 'Named build job must carry the image build')
  return writers
}
function qualificationRole(doc) {
  const qualified = Object.entries(doc.jobs).filter(([id]) => id.startsWith('qualify-'))
  if (!qualified.length) return null
  assert.equal(qualified.length, 3, 'All three qualification roles required')
  for (const [id, role] of qualified) {
    assert.equal(role.if, '${{ inputs.qualification_only }}')
    const permissions = role.permissions || doc.permissions
    assert.ok(permissions && typeof permissions === 'object')
    assert.equal(permissions.contents, 'read')
    assert.ok(Object.values(permissions).every(value => value === 'read' || value === 'none'), 'Qualification must be read-only')
    if (id !== 'qualify-backend-fidelity') {
      assert.doesNotMatch(JSON.stringify(role), /YARN_NPM_REGISTRY_SERVER|npmRegistryServer|yarn-install-network-resilient\.cjs\b/, 'CI install exception is backend Install only')
    }
  }
  const job = doc.jobs['qualify-backend-fidelity']
  assert.ok(job, 'Backend qualification role required')
  assert.equal(doc.jobs.build.if, '${{ !inputs.qualification_only }}')
  const template = parseWorkflow(text).jobs['backend-fidelity']
  const exactStep = name => {
    const actual = job.steps.filter(step => step.name === name)
    const expected = template.steps.filter(step => step.name === name)
    assert.equal(actual.length, 1); assert.equal(expected.length, 1)
    assert.deepEqual(actual[0], expected[0], 'Qualification install/tests must execute the exact failure-preserving trusted step')
    return actual[0]
  }
  const install = exactStep('Install')
  exactStep('Run classification/cart/catalog fidelity')
  assert.equal(install.env.YARN_NPM_REGISTRY_SERVER, 'https://registry.npmjs.org')
  assert.equal(install.run, 'node scripts/release/yarn-install-network-resilient.cjs --cwd apps/backend')
  assert.ok(!job['continue-on-error'] && !job.steps.some(step => step['continue-on-error']), 'No ignored failures')
  const outsideInstall = { ...job, steps: job.steps.filter(step => step !== install) }
  assert.doesNotMatch(JSON.stringify(outsideInstall), /YARN_NPM_REGISTRY_SERVER|npmRegistryServer|yarn-install-network-resilient\.cjs\b/, 'CI install exception is backend Install only')
  return job
}

function validateBakeRegistry(doc) {
  assert.doesNotMatch(JSON.stringify(doc.env || {}), /YARN_NPM_REGISTRY_SERVER|npmRegistryServer/, 'No global registry override')
  for (const job of imageJobs(doc)) {
    assert.doesNotMatch(JSON.stringify(job), /YARN_NPM_REGISTRY_SERVER|npmRegistryServer/, 'No registry override in any actual image job')
  }
  qualificationRole(doc)
}
if (fs.existsSync(bakeWorkflow)) {
  const bake = fs.readFileSync(bakeWorkflow, 'utf8')
  const doc = parseWorkflow(bake)
  validateBakeRegistry(doc)
  check(true, 'Parsed image jobs prohibit registry override; qualification registry is explicitly scoped')
  const leak = structuredClone(doc); leak.jobs.build.env = { YARN_NPM_REGISTRY_SERVER: 'https://registry.npmjs.org' }
  assert.throws(() => validateBakeRegistry(leak), /registry override/)
  const globalLeak = structuredClone(doc); globalLeak.env.YARN_NPM_REGISTRY_SERVER = 'https://registry.npmjs.org'
  assert.throws(() => validateBakeRegistry(globalLeak), /registry override/)
  const rogue = structuredClone(doc); rogue.jobs.rogue = { steps: [{ uses: 'docker/build-push-action@v6', env: { YARN_NPM_REGISTRY_SERVER: 'https://registry.npmjs.org' } }] }
  assert.throws(() => validateBakeRegistry(rogue), /image job/)
  const missing = structuredClone(doc); delete missing.jobs.build
  assert.throws(() => validateBakeRegistry(missing), /build job/)
  assert.throws(() => parseWorkflow(bake.replace('  build:\n', '  build: {}\n  build:\n')), /Duplicate/)
  if (doc.jobs['qualify-backend-fidelity']) {
    const wrongMode = structuredClone(doc); wrongMode.jobs['qualify-backend-fidelity'].if = '${{ always() }}'
    assert.throws(() => validateBakeRegistry(wrongMode))
    const wrongRegistry = structuredClone(doc); wrongRegistry.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Install').env.YARN_NPM_REGISTRY_SERVER = 'https://registry.yarnpkg.com'
    assert.throws(() => validateBakeRegistry(wrongRegistry))
    const skipped = structuredClone(doc); skipped.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Install').if = false
    assert.throws(() => validateBakeRegistry(skipped))
    const skippedTests = structuredClone(doc); skippedTests.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Run classification/cart/catalog fidelity').if = false
    assert.throws(() => validateBakeRegistry(skippedTests))
    const swallowed = structuredClone(doc); swallowed.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Run classification/cart/catalog fidelity').run += ' || true'
    assert.throws(() => validateBakeRegistry(swallowed))
    const misplaced = structuredClone(doc); misplaced.jobs['qualify-storefront'].steps.push({ run: 'node scripts/release/yarn-install-network-resilient.cjs', env: { YARN_NPM_REGISTRY_SERVER: 'https://registry.npmjs.org' } })
    assert.throws(() => validateBakeRegistry(misplaced), /backend Install only/)
    const wrongOtherMode = structuredClone(doc); wrongOtherMode.jobs['qualify-storefront'].if = '${{ always() }}'
    assert.throws(() => validateBakeRegistry(wrongOtherMode))
    const legacy = structuredClone(doc)
    for (const key of Object.keys(legacy.jobs)) if (key.startsWith('qualify-')) delete legacy.jobs[key]
    delete legacy.jobs.build.if
    validateBakeRegistry(legacy)
  }
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
