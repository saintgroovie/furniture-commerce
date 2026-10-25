#!/usr/bin/env node
/**
 * Fail-closed gate for release_mode=isolated_storefront.
 *
 * Default main releases do not use this script. It is not a bypass:
 * the candidate must be the exact tip of origin/release/<name>, must
 * descend from the declared production storefront SHA, and the diff
 * may contain only non-runtime storefront files. Migrations and DB
 * mutation are forbidden. The backend image is reuse-only.
 */
const { execFileSync } = require("child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")

const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const RELEASE_REF_RE = /^release\/[A-Za-z0-9][A-Za-z0-9._/-]*$/

function fail(message) {
  const error = new Error(message)
  error.code = "ISOLATED_STOREFRONT_BAKE_REJECTED"
  throw error
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function isMigrationPath(file) {
  const base = file.split("/").pop() || ""
  if (file.includes("/migrations/")) return true
  if (/Migration\d{8,}/.test(base)) return true
  if (base.endsWith(".sql")) return true
  return false
}

function rejectionReason(file) {
  const base = file.split("/").pop() || ""
  if (isMigrationPath(file)) return `migration:${file}`
  if (file.startsWith("apps/backend/")) return `backend:${file}`
  if (
    file.includes("docker-compose") ||
    /^Dockerfile/i.test(base) ||
    /^(docker-)?compose\.ya?ml$/i.test(base)
  ) {
    return `runtime:${file}`
  }
  if (base === ".env" || base.startsWith(".env.") || file.endsWith(".env")) return `env:${file}`
  if (
    base === "yarn.lock" ||
    base === "package.json" ||
    base === "pnpm-lock.yaml" ||
    base === "package-lock.json" ||
    base === "npm-shrinkwrap.json"
  ) {
    return `dependency:${file}`
  }
  if (file.startsWith("ops/") || file.startsWith("scripts/") || file.startsWith(".github/")) {
    return `governance:${file}`
  }
  if (!file.startsWith("apps/storefront/")) return `outside_storefront:${file}`
  return null
}

// The pre-component-revision production Dockerfile cannot satisfy the current
// image provenance gate. Permit only its byte-exact upgrade already merged in
// a13a139e (artifact revision ARG/ENV + validation). Any other Dockerfile edit,
// including a further change to that trusted version, remains forbidden.
function isComponentRevisionBakeBackport(repo, base, source, file) {
  if (file !== "apps/storefront/Dockerfile") return false
  try {
    const hashAt = (ref) => createHash("sha256").update(execFileSync("git", ["-C", repo, "show", `${ref}:${file}`], { stdio: ["ignore", "pipe", "pipe"] })).digest("hex")
    return hashAt(base) === "d4dd6d950d8787c6da07f91881f676a9ba2d21be9f0af2fc399f37e7926c39c2"
      && hashAt(source) === "b9acdbddaca5f7d5742b0ba6f548482685818f0adf6e9d228785d321547f69db"
  } catch {
    return false
  }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex") }
function blob(repo, ref, file) {
  try { return execFileSync("git", ["-C", repo, "show", `${ref}:${file}`], { stdio: ["ignore", "pipe", "pipe"] }) }
  catch { return null }
}

// A separate, opt-in runtime release contract. This never widens the default
// Dockerfile exception. The registry belongs to this trusted script checkout,
// not the source being built; every source/base/path/runtime byte is sealed.
function validateRuntimePolicy(input, files) {
  const registryPath = path.join(__dirname, "storefront-runtime-policies.json")
  return validateRuntimeContract(input, files, fs.readFileSync(registryPath),
    fs.readFileSync(path.join(__dirname, "fixtures/isolated-storefront/Dockerfile.node24-catalog-v1")), !input.qualificationOnly)
}

// Pure contract validation also accepts explicit trusted bytes for isolated fixtures;
// production CLI always obtains them from the adjacent trusted checkout above.
function validateRuntimeContract(input, files, registryBytes, fixture, requireChecks = true) {
  const registry = JSON.parse(registryBytes)
  const policy = Object.hasOwn(registry.policies, input.runtimePolicy) && registry.policies[input.runtimePolicy]
  if (registry.schema_version !== 1 || !policy) fail("unknown runtime policy")
  if (!SHA_RE.test(input.trustedPolicySha || "")) fail("trusted policy SHA required")
  if (requireChecks && !input.sourceChecksFile) fail("source check receipts required")
  for (const [actual, expected, label] of [
    [input.sourceSha, policy.source_sha, "source"],
    [input.productionBaseSha, policy.base_sha, "base"],
    [input.backendRevision, policy.backend_revision, "backend revision"],
    [input.backendDigest, policy.backend_digest, "backend digest"],
    [input.productionStorefrontDigest, policy.production_storefront_digest, "published storefront digest"],
  ]) if (actual !== expected) fail(`runtime policy mismatch: ${label}`)
  for (const [actual, expected, label] of [
    [git(input.repo, ["rev-parse", `${input.sourceSha}^{tree}`]), policy.source_tree, "source tree"],
    [git(input.repo, ["rev-parse", `${input.productionBaseSha}^{tree}`]), policy.base_tree, "base tree"],
    [git(input.repo, ["rev-parse", `${input.backendRevision}:apps/backend`]), policy.backend_tree, "retained backend tree"],
  ]) if (actual !== expected) fail(`runtime policy mismatch: ${label}`)
  if (JSON.stringify([...files].sort()) !== JSON.stringify(Object.keys(policy.paths).sort())) fail("runtime policy path set mismatch")
  for (const [file, hashes] of Object.entries(policy.paths)) {
    for (const [ref, expected] of [[input.productionBaseSha, hashes.before], [input.sourceSha, hashes.after]]) {
      const bytes = blob(input.repo, ref, file)
      if ((bytes === null ? null : sha256(bytes)) !== expected) fail(`runtime policy blob mismatch: ${file}`)
    }
  }
  for (const [file, expected] of Object.entries(policy.protected)) {
    for (const ref of [input.productionBaseSha, input.sourceSha]) {
      const bytes = blob(input.repo, ref, file)
      if (!bytes || sha256(bytes) !== expected) fail(`protected source changed: ${file}`)
    }
  }
  const dockerfile = blob(input.repo, input.sourceSha, "apps/storefront/Dockerfile").toString()
  if (sha256(fixture) !== policy.paths["apps/storefront/Dockerfile"].after ||
      !dockerfile.includes(`FROM ${policy.runtime_after} AS runner\n`)) fail("runtime runner/fixture mismatch")
  const checks = requireChecks ? JSON.parse(fs.readFileSync(input.sourceChecksFile, "utf8")) : []
  if (requireChecks) validateSourceReceipts(checks, policy, input.sourceSha, input.trustedPolicySha)
  return { id: input.runtimePolicy, policy_sha: input.trustedPolicySha, registry_sha256: sha256(registryBytes),
    source_tree: policy.source_tree, backend_tree: policy.backend_tree,
    runtime_before: policy.runtime_before, runtime_after: policy.runtime_after, source_checks: checks }
}

// A build-transport fix may consume a single already accepted qualification.
// Source/test/runtime contracts are byte-canonical equal; no prior-policy chain.
function validateQualificationContinuity(policy, readPolicy = null) {
  const pin = policy.qualification_receipt
  if (!pin) return null
  if (!SHA_RE.test(pin.policy_sha || "") || !/^[0-9a-f]{64}$/.test(pin.registry_sha256 || "") || !/^[0-9a-f]{64}$/.test(pin.contract_sha256 || "") || !Number.isSafeInteger(pin.run_id) || pin.run_id <= 0 || pin.run_attempt !== 1) fail("qualification continuity pin invalid")
  const file = "scripts/release/storefront-runtime-policies.json"
  const bytes = readPolicy ? readPolicy(pin.policy_sha, file) : blob(path.resolve(__dirname, "../.."), pin.policy_sha, file)
  if (!bytes || sha256(bytes) !== pin.registry_sha256) fail("qualification history missing or registry mismatch")
  const before = JSON.parse(bytes).policies["node20-to-node24-catalog-v1"]
  const current = { ...policy }; delete current.qualification_receipt
  if (!before || before.qualification_receipt || sha256(JSON.stringify(before)) !== pin.contract_sha256 || JSON.stringify(current) !== JSON.stringify(before)) fail("qualification policy core mismatch or reuse chain")
  return pin
}

function validateSourceReceipts(checks, policy, sourceSha, policySha) {
  const qualificationSha = policy.qualification_receipt?.policy_sha || policySha
  if (policy.qualification_receipt) {
    const core = { ...policy }; delete core.qualification_receipt
    if (sha256(JSON.stringify(core)) !== policy.qualification_receipt.contract_sha256) fail("qualification continuity core mismatch")
  }
  if (!Array.isArray(checks) || checks.length !== policy.required_checks.length) fail("incomplete source checks")
  for (const name of policy.required_checks) {
    const rows = checks.filter(x => x.name === name)
    const x = rows[0]
    if (rows.length !== 1 || x.source_sha !== sourceSha || x.head_sha !== qualificationSha || x.policy_sha !== qualificationSha || x.conclusion !== "success" ||
        x.workflow_path !== policy.required_workflow || x.event !== policy.source_ci_event ||
        x.head_branch !== policy.source_ci_ref || x.source_base_sha !== policy.base_sha ||
        x.source_tree !== policy.source_tree || !Number.isSafeInteger(x.run_id) || x.run_id <= 0 ||
        !Number.isSafeInteger(x.run_attempt) || x.run_attempt <= 0 ||
        !Number.isSafeInteger(x.check_id) || x.check_id <= 0 ||
        !Number.isSafeInteger(x.seal_artifact_id) || x.seal_artifact_id <= 0) fail(`source check not qualified: ${name}`)
  }
  for (const check of checks) {
    const key = policy.qualification_jobs[check.name]
    const reused = check.reused_checks
    const pin = policy.qualification_receipt
    if (pin && (check.run_id !== pin.run_id || check.run_attempt !== pin.run_attempt || check.qualification_registry_sha256 !== pin.registry_sha256)) fail("qualification continuity receipt mismatch")
    if (!policy.qualification_reuse || key === "storefront") {
      if (reused !== undefined) fail("unexpected reused source receipt")
      continue
    }
    if (!reused || ![reused.runId, reused.runAttempt, reused.jobId, reused.checkId].every(x => Number.isSafeInteger(x) && x > 0)) fail("reused source receipt required")
    if (key === "backend-fidelity") {
      const pin = policy.qualification_reuse
      if (reused.origin !== "prior-qualified-backend" || reused.runId !== pin.backend_run_id || reused.runAttempt !== pin.backend_run_attempt || reused.policySha !== pin.backend_policy_sha || reused.artifactId !== pin.backend_artifact_id || reused.artifactDigest !== pin.backend_artifact_digest || reused.sealSha256 !== pin.backend_seal_sha256) fail("reused backend receipt mismatch")
    } else if (reused.origin !== "mandatory-pr-ci-exact-policy-tree" || reused.mergedPolicySha !== qualificationSha || ![reused.policySha, reused.policyTree, reused.checkedOutSha].every(x => SHA_RE.test(x || "")) || reused.commandTemplateSha256 !== policy.qualification_job_template_sha256) fail("reused governance receipt mismatch")
  }
  if (new Set(checks.map(x => `${x.run_id}/${x.run_attempt}`)).size !== 1 ||
      new Set(checks.map(x => x.check_id)).size !== checks.length) fail("source checks must belong to one execution attempt")
}

// The official workflow always uses the GitHub API collector. An explicit API
// dependency permits offline wrong-event/base/ref/attempt tests, not a CLI bypass.
function collectSourceChecks(input, request = null, readSeal = null, reuseCollector = collectQualificationReuse, readPolicy = null) {
  if (!SHA_RE.test(input.sourceSha || "") || !SHA_RE.test(input.trustedPolicySha || "")) fail("source checks require exact source and policy SHA")
  if (!/^[1-9][0-9]*$/.test(String(input.qualificationRunId || ""))) fail("qualification run ID required")
  if (String(input.qualificationRunId) === process.env.GITHUB_RUN_ID) fail("qualification cannot be the build execution itself")
  const repo = process.env.GITHUB_REPOSITORY || ""
  if (!input.runtimePolicy || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail("source checks require runtime policy and GitHub repository")
  const registryBytes = fs.readFileSync(path.join(__dirname, "storefront-runtime-policies.json"))
  const policy = JSON.parse(registryBytes).policies[input.runtimePolicy]
  if (!policy) fail("unknown runtime policy")
  const pinned = validateQualificationContinuity(policy, readPolicy)
  if (pinned && Number(input.qualificationRunId) !== pinned.run_id) fail("qualification continuity run mismatch")
  const qualificationSha = pinned?.policy_sha || input.trustedPolicySha
  const qualificationRegistrySha = pinned?.registry_sha256 || sha256(registryBytes)
  const api = request || ((suffix, paginate = false) => JSON.parse(execFileSync("gh", ["api",
    ...(paginate ? ["--paginate", "--slurp"] : []), `repos/${repo}/${suffix}`], { encoding: "utf8" })))
  const run = api(`actions/runs/${input.qualificationRunId}`)
  if (run.id !== Number(input.qualificationRunId) || run.repository?.full_name !== repo ||
      run.path !== policy.required_workflow || run.head_sha !== qualificationSha ||
      run.event !== policy.source_ci_event || run.head_branch !== policy.source_ci_ref ||
      !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0 ||
      run.status !== "completed" || run.conclusion !== "success" || (pinned && run.run_attempt !== pinned.run_attempt)) fail("source CI workflow/ref/event/policy mismatch")
  const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs)
  const buildJobs = jobs.filter(x => x.name === "build")
  if (buildJobs.length !== 1 || buildJobs[0].conclusion !== "skipped") fail("qualification must not build or publish images")
  const artifacts = api(`actions/runs/${run.id}/artifacts?per_page=100`, true).flatMap(page => page.artifacts)
  const receipts = policy.required_checks.map(name => {
    const matched = jobs.filter(x => x.name === name)
    const job = matched[0]
    if (matched.length !== 1 || job.status !== "completed" || job.conclusion !== "success") fail(`source CI not successful: ${name}`)
    const prefix = `https://api.github.com/repos/${repo}/check-runs/`
    if (!String(job.check_run_url).startsWith(prefix)) fail("source check URL invalid")
    const checkId = Number(String(job.check_run_url).slice(prefix.length))
    if (!Number.isSafeInteger(checkId) || checkId <= 0) fail("source check ID invalid")
    const check = api(`check-runs/${checkId}`)
    if (check.id !== checkId || check.name !== name || check.app?.slug !== "github-actions" ||
        check.head_sha !== qualificationSha || check.check_suite?.id !== run.check_suite_id ||
        check.status !== "completed" || check.conclusion !== "success") fail("source check membership mismatch")
    const key = policy.qualification_jobs[name]
    const artifactName = `runtime-qualification-${run.id}-${run.run_attempt}-${key}`
    const rows = artifacts.filter(x => x.name === artifactName && !x.expired)
    if (rows.length !== 1) fail("source seal artifact missing or ambiguous")
    let seal
    if (readSeal) seal = readSeal(artifactName)
    else {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-source-seal-"))
      try {
        execFileSync("gh", ["run", "download", String(run.id), "--repo", repo, "--name", artifactName, "--dir", dir], { stdio: "pipe" })
        const file = path.join(dir, "qualification.json")
        if (fs.readdirSync(dir).length !== 1 || fs.statSync(file).size > 65536) fail("invalid source seal payload")
        seal = JSON.parse(fs.readFileSync(file, "utf8"))
      } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    }
    if (seal.sourceSha !== input.sourceSha || seal.sourceTree !== policy.source_tree ||
        seal.productionBaseSha !== policy.base_sha || seal.policySha !== qualificationSha ||
        seal.policyRegistrySha256 !== qualificationRegistrySha || seal.jobKey !== key ||
        seal.runId !== run.id || seal.runAttempt !== run.run_attempt || seal.postChecks !== true) fail("qualification source seal mismatch")
    let reuse
    if (policy.qualification_reuse && key !== "storefront") {
      reuse = reuseCollector({ ...input, trustedPolicySha: qualificationSha, qualificationJob: key })
      if (JSON.stringify(seal.reusedChecks) !== JSON.stringify(reuse)) fail("qualification reused provenance mismatch")
    } else if (seal.reusedChecks !== undefined) fail("unexpected reused source gate")
    return { name, source_sha: input.sourceSha, head_sha: check.head_sha, policy_sha: run.head_sha,
      conclusion: check.conclusion, workflow_path: run.path, event: run.event, head_branch: run.head_branch,
      run_id: run.id, run_attempt: run.run_attempt, check_id: check.id, seal_artifact_id: rows[0].id,
      source_base_sha: policy.base_sha, source_tree: policy.source_tree, ...(pinned ? { qualification_registry_sha256: qualificationRegistrySha } : {}), ...(reuse ? { reused_checks: reuse } : {}) }
  })
  validateSourceReceipts(receipts, policy, input.sourceSha, input.trustedPolicySha)
  fs.writeFileSync(input.sourceChecksFile, JSON.stringify(receipts, null, 2) + "\n")
  return receipts
}

// Reuse is explicit provenance, never a claim that the new run executed old tests.
// The old SF job has no postseal: it is deliberately ineligible for reuse.
function collectQualificationReuse(input, request = null, loadArtifact = null, readGit = null) {
  const policyRepo = path.resolve(__dirname, "../..")
  const at = readGit || ((ref, file) => blob(policyRepo, ref, file))
  const rev = ref => readGit ? readGit(ref, null) : git(policyRepo, ["rev-parse", ref])
  const registryBytes = fs.readFileSync(path.join(__dirname, "storefront-runtime-policies.json"))
  const policy = JSON.parse(registryBytes).policies[input.runtimePolicy]
  const reuse = policy?.qualification_reuse
  if (!reuse || !["backend-fidelity", "release-governance"].includes(input.qualificationJob)) fail("qualification reuse role invalid")
  const repo = process.env.GITHUB_REPOSITORY || ""
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail("qualification reuse repository required")
  const api = request || ((suffix, paginate = false) => JSON.parse(execFileSync("gh", ["api", ...(paginate ? ["--paginate", "--slurp"] : []), `repos/${repo}/${suffix}`], { encoding: "utf8" })))
  const validateJob = (run, name, head) => {
    const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs)
    const matches = jobs.filter(x => x.name === name)
    const job = matches[0]
    if (matches.length !== 1 || job.status !== "completed" || job.conclusion !== "success" || job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== head) fail("reused job not successful in exact attempt")
    const prefix = `https://api.github.com/repos/${repo}/check-runs/`
    if (!String(job.check_run_url).startsWith(prefix)) fail("reused check URL invalid")
    const id = Number(job.check_run_url.slice(prefix.length))
    if (!Number.isSafeInteger(id) || id <= 0) fail("reused check ID invalid")
    const check = api(`check-runs/${id}`)
    if (check.id !== id || check.name !== name || check.app?.slug !== "github-actions" || check.head_sha !== head || check.check_suite?.id !== run.check_suite_id || check.status !== "completed" || check.conclusion !== "success") fail("reused check membership mismatch")
    return { job, checkId: id, jobs }
  }
  if (input.qualificationJob === "backend-fidelity") {
    const previousBytes = at(reuse.backend_policy_sha, "scripts/release/storefront-runtime-policies.json")
    if (!previousBytes || sha256(previousBytes) !== reuse.backend_registry_sha256) fail("reused backend registry changed")
    const previous = JSON.parse(previousBytes).policies[input.runtimePolicy]
    const current = { ...policy }; delete current.qualification_reuse; delete current.qualification_receipt
    if (JSON.stringify(current) !== JSON.stringify(previous)) fail("reused backend source or dependency contract changed")
    for (const file of [".github/workflows/pr-checks.yml", "scripts/release/yarn-install-network-resilient.cjs"]) {
      const before = at(reuse.backend_policy_sha, file), after = at(input.trustedPolicySha, file)
      if (!before || !after || sha256(before) !== sha256(after)) fail("reused backend trusted command dependency changed")
    }
    const run = api(`actions/runs/${reuse.backend_run_id}`)
    if (run.id !== reuse.backend_run_id || run.run_attempt !== reuse.backend_run_attempt || run.repository?.full_name !== repo || run.head_sha !== reuse.backend_policy_sha || run.path !== policy.required_workflow || run.event !== policy.source_ci_event || run.head_branch !== policy.source_ci_ref || run.status !== "completed" || run.conclusion !== "failure") fail("reused backend workflow mismatch")
    const { job, checkId, jobs } = validateJob(run, "Backend fidelity tests", reuse.backend_policy_sha)
    const builds = jobs.filter(x => x.name === "build")
    if (builds.length !== 1 || builds[0].conclusion !== "skipped") fail("reused backend run published images")
    const name = `runtime-qualification-${run.id}-${run.run_attempt}-backend-fidelity`
    const artifacts = api(`actions/runs/${run.id}/artifacts?per_page=100`, true).flatMap(page => page.artifacts)
    const found = artifacts.filter(x => x.name === name && !x.expired)
    const artifact = found[0]
    if (found.length !== 1 || artifact.id !== reuse.backend_artifact_id || artifact.digest !== reuse.backend_artifact_digest || artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== run.head_sha) fail("reused backend seal artifact missing or changed")
    let bytes
    if (loadArtifact) bytes = loadArtifact(run.id, name)
    else {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-reused-seal-"))
      try {
        execFileSync("gh", ["run", "download", String(run.id), "--repo", repo, "--name", name, "--dir", dir], { stdio: "pipe" })
        const file = path.join(dir, "qualification.json")
        if (fs.readdirSync(dir).length !== 1 || fs.statSync(file).size > 65536) fail("invalid reused seal payload")
        bytes = fs.readFileSync(file)
      } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    }
    if (!bytes || sha256(bytes) !== reuse.backend_seal_sha256) fail("reused backend seal bytes changed")
    const seal = JSON.parse(bytes)
    if (seal.sourceSha !== input.sourceSha || seal.sourceTree !== policy.source_tree || seal.productionBaseSha !== policy.base_sha || seal.policySha !== run.head_sha || seal.policyRegistrySha256 !== reuse.backend_registry_sha256 || seal.jobKey !== "backend-fidelity" || seal.runId !== run.id || seal.runAttempt !== run.run_attempt || seal.postChecks !== true) fail("reused backend source seal mismatch")
    return { origin: "prior-qualified-backend", runId: run.id, runAttempt: run.run_attempt, policySha: run.head_sha,
      jobId: job.id, checkId, artifactId: artifact.id, artifactDigest: artifact.digest, sealSha256: reuse.backend_seal_sha256 }
  }
  // Governance runs once in mandatory PR CI of the reviewed tree. A genuine
  // two-parent merge must retain that exact tree; arbitrary ancestors cannot qualify.
  const reviewedSha = rev(`${input.trustedPolicySha}^2`)
  const tree = rev(`${input.trustedPolicySha}^{tree}`)
  if (!SHA_RE.test(reviewedSha) || rev(`${reviewedSha}^{tree}`) !== tree) fail("governance PR tree differs from merged policy")
  const template = at(input.trustedPolicySha, ".github/workflows/pr-checks.yml")
  const reviewedTemplate = at(reviewedSha, ".github/workflows/pr-checks.yml")
  if (!template || !reviewedTemplate || sha256(template) !== policy.qualification_job_template_sha256 || sha256(template) !== sha256(reviewedTemplate)) fail("governance command template differs")
  const runs = api(`actions/runs?head_sha=${reviewedSha}&event=pull_request&status=success&per_page=100`, true).flatMap(page => page.workflow_runs)
  const candidates = runs.filter(x => x.path === ".github/workflows/pr-checks.yml" && x.head_sha === reviewedSha && x.status === "completed" && x.conclusion === "success" && x.event === "pull_request" && x.repository?.full_name === repo)
  if (candidates.length !== 1) fail("governance PR CI missing or ambiguous")
  const run = api(`actions/runs/${candidates[0].id}`)
  if (run.id !== candidates[0].id || run.head_sha !== reviewedSha || run.repository?.full_name !== repo || run.path !== ".github/workflows/pr-checks.yml" || run.event !== "pull_request" || run.status !== "completed" || run.conclusion !== "success" || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) fail("governance PR CI workflow mismatch")
  const { job, checkId } = validateJob(run, "Release governance gates", reviewedSha)
  // PR check head_sha is the feature head, while checkout defaults to the PR
  // merge ref. Verify the actual checkout object from the completed job log.
  const logPath = `actions/jobs/${job.id}/logs`
  const logs = request ? api(logPath) : execFileSync("gh", ["api", "--allow-escape-sequences", `repos/${repo}/${logPath}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  const checkout = [...String(logs).matchAll(/\[command\][^\n]*\/git log -1 --format=%H\r?\n[^\n]*Z ([0-9a-f]{40})(?:\r?\n|$)/g)]
  if (checkout.length !== 1) fail("governance actual checkout proof missing or ambiguous")
  const checkoutSha = checkout[0][1]
  const checkedCommit = api(`git/commits/${checkoutSha}`)
  if (checkedCommit.sha !== checkoutSha || checkedCommit.tree?.sha !== tree || !checkedCommit.parents?.some(x => x.sha === reviewedSha)) fail("governance actual checkout tree differs")
  return { origin: "mandatory-pr-ci-exact-policy-tree", runId: run.id, runAttempt: run.run_attempt, policySha: reviewedSha,
    mergedPolicySha: input.trustedPolicySha, policyTree: tree, checkedOutSha: checkoutSha, commandTemplateSha256: sha256(template), jobId: job.id, checkId }
}

function assertNoExtraProductionSource(repo) {
  // Deliberately omit --exclude-standard: an ignored file can still be compiled.
  if (git(repo, ["ls-files", "--others", "-z", "--", "apps/storefront/src", "apps/storefront/public", "apps/backend/src"])) fail("untracked production source in qualification")
}

function qualificationSeal(input, runtimePolicy) {
  if (!["storefront", "backend-fidelity", "release-governance"].includes(input.qualificationJob)) fail("qualification job required")
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_REF !== "refs/heads/main" ||
      process.env.GITHUB_SHA !== input.trustedPolicySha) fail("qualification requires trusted main workflow dispatch")
  const registryBytes = fs.readFileSync(path.join(__dirname, "storefront-runtime-policies.json"))
  const policy = JSON.parse(registryBytes).policies[input.runtimePolicy]
  const template = fs.readFileSync(path.join(__dirname, "../../.github/workflows/pr-checks.yml"))
  if (sha256(template) !== policy.qualification_job_template_sha256) fail("qualification command template changed")
  for (const [file, hashes] of Object.entries(policy.paths)) {
    if (sha256(fs.readFileSync(path.join(input.repo, file))) !== hashes.after) fail(`working source changed: ${file}`)
  }
  for (const [file, hash] of Object.entries(policy.protected)) {
    if (sha256(fs.readFileSync(path.join(input.repo, file))) !== hash) fail(`working protected source changed: ${file}`)
  }
  const delta = git(input.repo, ["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean)
  assertNoExtraProductionSource(input.repo)
  for (const file of delta) {
    if (input.qualificationJob !== "storefront" || !Object.hasOwn(policy.qualification_test_overlays, file) ||
        sha256(fs.readFileSync(path.join(input.repo, file))) !== policy.qualification_test_overlays[file]) fail(`unqualified test/source overlay: ${file}`)
  }
  return { sourceSha: input.sourceSha, sourceTree: policy.source_tree, productionBaseSha: policy.base_sha,
    policySha: input.trustedPolicySha, policyRegistrySha256: runtimePolicy.registry_sha256,
    jobKey: input.qualificationJob, runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), postChecks: !!input.postChecks,
    ...(policy.qualification_reuse && input.qualificationJob !== "storefront" ? { reusedChecks: collectQualificationReuse(input) } : {}) }
}

function parseArgs(argv) {
  const out = { dbMutation: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (argv[i] == null) fail(`missing value for ${arg}`)
      return argv[i]
    }
    if (arg === "--release-mode") out.releaseMode = next()
    else if (arg === "--source-sha") out.sourceSha = next()
    else if (arg === "--production-base-sha") out.productionBaseSha = next()
    else if (arg === "--release-ref") out.releaseRef = next()
    else if (arg === "--backend-digest") out.backendDigest = next()
    else if (arg === "--backend-revision") out.backendRevision = next()
    else if (arg === "--runtime-policy") out.runtimePolicy = next()
    else if (arg === "--trusted-policy-sha") out.trustedPolicySha = next()
    else if (arg === "--source-checks-file") out.sourceChecksFile = next()
    else if (arg === "--production-storefront-digest") out.productionStorefrontDigest = next()
    else if (arg === "--evidence-output") out.evidenceOutput = next()
    else if (arg === "--qualification-only") out.qualificationOnly = true
    else if (arg === "--post-checks") out.postChecks = true
    else if (arg === "--qualification-job") out.qualificationJob = next()
    else if (arg === "--qualification-run-id") out.qualificationRunId = next()
    else if (arg === "--fetch-source-checks") out.fetchSourceChecks = true
    else if (arg === "--repo") out.repo = next()
    else if (arg === "--db-mutation") out.dbMutation = next() === "true"
    else if (arg === "--github-output") out.githubOutput = true
    else fail(`unknown argument ${arg}`)
  }
  return out
}

function validateIsolatedStorefrontBake(input) {
  if (input.releaseMode !== "isolated_storefront") {
    fail("release_mode must be isolated_storefront; main mode cannot use this path")
  }
  if (input.dbMutation) fail("DB_MUTATION_FORBIDDEN")
  if (!SHA_RE.test(input.sourceSha || "")) fail("source SHA must be 40 hex characters")
  if (!SHA_RE.test(input.productionBaseSha || "")) fail("production base SHA must be 40 hex characters")
  if (input.sourceSha === input.productionBaseSha) fail("candidate SHA must differ from the production base")
  if (!RELEASE_REF_RE.test(input.releaseRef || "") || input.releaseRef.includes("..")) {
    fail("release ref must be origin release/<name>")
  }
  if (!DIGEST_RE.test(input.backendDigest || "")) fail("backend digest must be sha256:<64 hex>")
  if (!SHA_RE.test(input.backendRevision || "")) fail("backend revision must be 40 hex characters")
  if (!input.repo) fail("repo path is required")

  let tip = ""
  try {
    tip = git(input.repo, ["rev-parse", "--verify", `refs/remotes/origin/${input.releaseRef}`])
  } catch {
    fail(`release ref origin/${input.releaseRef} is not fetched`)
  }
  if (tip !== input.sourceSha) {
    fail(`release ref tip ${tip} is not candidate ${input.sourceSha}`)
  }

  let head = ""
  try {
    head = git(input.repo, ["rev-parse", "HEAD"])
  } catch {
    fail("cannot resolve HEAD")
  }
  if (head !== input.sourceSha) fail(`HEAD ${head} is not candidate ${input.sourceSha}`)

  try {
    git(input.repo, ["merge-base", "--is-ancestor", input.productionBaseSha, input.sourceSha])
  } catch {
    fail("production base is not an ancestor of the candidate")
  }

  let mainSha = ""
  try {
    mainSha = git(input.repo, ["rev-parse", "--verify", "refs/remotes/origin/main"])
  } catch {
    fail("origin/main is not fetched")
  }
  if (!SHA_RE.test(mainSha)) fail("origin/main is not a commit")

  const names = git(input.repo, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    `${input.productionBaseSha}...${input.sourceSha}`,
  ])
  const files = names ? names.split("\0").filter(Boolean) : []
  const runtimePolicy = input.runtimePolicy ? validateRuntimePolicy(input, files) : null
  const reasons = files.map((file) => (runtimePolicy && file === "apps/storefront/Dockerfile") || isComponentRevisionBakeBackport(input.repo, input.productionBaseSha, input.sourceSha, file) ? null : rejectionReason(file)).filter(Boolean)
  if (reasons.length) fail(`scope rejected: ${reasons.join(", ")}`)
  if (files.some(isMigrationPath)) fail("migration count must be zero")

  return {
    releaseMode: "isolated_storefront",
    sourceSha: input.sourceSha,
    productionBaseSha: input.productionBaseSha,
    releaseRef: input.releaseRef,
    mainSha,
    backendDigest: input.backendDigest,
    backendRevision: input.backendRevision,
    migrationCount: 0,
    dbMutation: "forbidden",
    buildBackend: false,
    files,
    ...(runtimePolicy ? { runtimePolicy } : {}),
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.runtimePolicy && !args.fetchSourceChecks && !args.qualificationOnly) fail("runtime CLI requires live source CI collection")
    if (args.fetchSourceChecks) collectSourceChecks(args)
    let reusedChecks
    const result = validateIsolatedStorefrontBake(args)
    if (args.qualificationOnly) {
      if (!args.runtimePolicy || args.fetchSourceChecks) fail("invalid qualification phase")
      const seal = qualificationSeal(args, result.runtimePolicy)
      if (!args.evidenceOutput) fail("qualification seal path required")
      fs.writeFileSync(args.evidenceOutput, JSON.stringify(seal, null, 2) + "\n")
      reusedChecks = seal.reusedChecks
    } else if (args.evidenceOutput) fs.writeFileSync(args.evidenceOutput, JSON.stringify(result, null, 2) + "\n")
    if (process.argv.includes("--github-output") && process.env.GITHUB_OUTPUT) {
      const fs = require("fs")
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        [
          `reused_gates=${reusedChecks ? "true" : "false"}`,
          `main_sha=${result.mainSha}`,
          `migration_count=${result.migrationCount}`,
          `build_backend=false`,
          `db_mutation=forbidden`,
        ].join("\n") + "\n"
      )
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}

module.exports = {
  validateIsolatedStorefrontBake,
  rejectionReason,
  isMigrationPath,
  validateRuntimePolicy,
  validateRuntimeContract,
  validateSourceReceipts,
  validateQualificationContinuity,
  collectSourceChecks,
  collectQualificationReuse,
  qualificationSeal,
  assertNoExtraProductionSource,
}

if (require.main === module) main()
