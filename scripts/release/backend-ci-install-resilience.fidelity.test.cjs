#!/usr/bin/env node
/**
 * Workflow fidelity: Backend CI install resilience v2 contract.
 *
 *   node scripts/release/backend-ci-install-resilience.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")

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

function validateBakeResilience(doc) {
  for (const job of imageJobs(doc)) {
    assert.doesNotMatch(JSON.stringify(job), /yarn-install-network-resilient|YARN_NPM_REGISTRY_SERVER|npmRegistryServer/, 'No CI helper/registry override in image job')
  }
  assert.doesNotMatch(JSON.stringify(doc.env || {}), /YARN_NPM_REGISTRY_SERVER|npmRegistryServer/)
  const qualification = qualificationRole(doc)
  if (qualification) {
    const tests = qualification.steps.filter(step => step.name === 'Run classification/cart/catalog fidelity')
    assert.equal(tests.length, 1)
    assert.match(tests[0].run, /yarn dlx tsx/)
    assert.doesNotMatch(tests[0].run, /yarn-install-network-resilient|until\s+yarn|--no-immutable/)
    assert.ok(qualification.steps.some(step => step.uses?.startsWith('actions/cache@') && step.with?.path === '~/.yarn/berry/cache'))
  }
}
if (fs.existsSync(bakeWorkflow)) {
  const bake = fs.readFileSync(bakeWorkflow, 'utf8')
  const doc = parseWorkflow(bake)
  validateBakeResilience(doc)
  check(true, 'Parsed image jobs prohibit CI helper; qualification install preserves bounded immutable retry')
  const leak = structuredClone(doc); leak.jobs.build.steps.push({ run: 'node scripts/release/yarn-install-network-resilient.cjs --cwd apps/backend' })
  assert.throws(() => validateBakeResilience(leak), /CI helper/)
  const rogue = structuredClone(doc); rogue.jobs.rogue = { steps: [{ uses: 'docker/build-push-action@v6' }, { run: 'node scripts/release/yarn-install-network-resilient.cjs' }] }
  assert.throws(() => validateBakeResilience(rogue), /image job/)
  assert.throws(() => parseWorkflow(bake.replace('  build:\n', '  build: {}\n  build:\n')), /Duplicate/)
  const missing = structuredClone(doc); delete missing.jobs.build
  assert.throws(() => validateBakeResilience(missing), /build job/)
  if (doc.jobs['qualify-backend-fidelity']) {
    const unbounded = structuredClone(doc); unbounded.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Install').run += ' --no-immutable'
    assert.throws(() => validateBakeResilience(unbounded))
    const ignored = structuredClone(doc); ignored.jobs['qualify-backend-fidelity']['continue-on-error'] = true
    assert.throws(() => validateBakeResilience(ignored), /ignored failures/)
    const skipped = structuredClone(doc); skipped.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Install').if = false
    assert.throws(() => validateBakeResilience(skipped))
    const skippedTests = structuredClone(doc); skippedTests.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Run classification/cart/catalog fidelity').if = false
    assert.throws(() => validateBakeResilience(skippedTests))
    const swallowed = structuredClone(doc); swallowed.jobs['qualify-backend-fidelity'].steps.find(x => x.name === 'Run classification/cart/catalog fidelity').run += ' || true'
    assert.throws(() => validateBakeResilience(swallowed))
    const misplaced = structuredClone(doc); misplaced.jobs['qualify-storefront'].steps.push({ run: 'node scripts/release/yarn-install-network-resilient.cjs', env: { YARN_NPM_REGISTRY_SERVER: 'https://registry.npmjs.org' } })
    assert.throws(() => validateBakeResilience(misplaced), /backend Install only/)
    const wrongOtherMode = structuredClone(doc); wrongOtherMode.jobs['qualify-storefront'].if = '${{ always() }}'
    assert.throws(() => validateBakeResilience(wrongOtherMode))
    const legacy = structuredClone(doc)
    for (const key of Object.keys(legacy.jobs)) if (key.startsWith('qualify-')) delete legacy.jobs[key]
    delete legacy.jobs.build.if
    validateBakeResilience(legacy)
  }
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
