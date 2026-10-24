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
    fs.readFileSync(path.join(__dirname, "fixtures/isolated-storefront/Dockerfile.node24-catalog-v1")))
}

// Pure contract validation also accepts explicit trusted bytes for isolated fixtures;
// production CLI always obtains them from the adjacent trusted checkout above.
function validateRuntimeContract(input, files, registryBytes, fixture) {
  const registry = JSON.parse(registryBytes)
  const policy = Object.hasOwn(registry.policies, input.runtimePolicy) && registry.policies[input.runtimePolicy]
  if (registry.schema_version !== 1 || !policy) fail("unknown runtime policy")
  if (!SHA_RE.test(input.trustedPolicySha || "")) fail("trusted policy SHA required")
  if (!input.sourceChecksFile) fail("source check receipts required")
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
  const checks = JSON.parse(fs.readFileSync(input.sourceChecksFile, "utf8"))
  validateSourceReceipts(checks, policy, input.sourceSha)
  return { id: input.runtimePolicy, policy_sha: input.trustedPolicySha, registry_sha256: sha256(registryBytes),
    source_tree: policy.source_tree, backend_tree: policy.backend_tree,
    runtime_before: policy.runtime_before, runtime_after: policy.runtime_after, source_checks: checks }
}

function validateSourceReceipts(checks, policy, sourceSha) {
  if (!Array.isArray(checks) || checks.length !== policy.required_checks.length) fail("incomplete source checks")
  for (const name of policy.required_checks) {
    const rows = checks.filter(x => x.name === name)
    const x = rows[0]
    if (rows.length !== 1 || x.head_sha !== sourceSha || x.conclusion !== "success" ||
        x.workflow_path !== policy.required_workflow || x.event !== policy.source_ci_event ||
        x.head_branch !== policy.source_ci_ref || x.source_base_sha !== policy.base_sha ||
        x.source_tree !== policy.source_tree || !Number.isSafeInteger(x.run_id) || x.run_id <= 0 ||
        !Number.isSafeInteger(x.run_attempt) || x.run_attempt <= 0 ||
        !Number.isSafeInteger(x.check_id) || x.check_id <= 0) fail(`source check not qualified: ${name}`)
  }
  if (new Set(checks.map(x => `${x.run_id}/${x.run_attempt}`)).size !== 1 ||
      new Set(checks.map(x => x.check_id)).size !== checks.length) fail("source checks must belong to one execution attempt")
}

// The official workflow always uses the GitHub API collector. An explicit API
// dependency permits offline wrong-event/base/ref/attempt tests, not a CLI bypass.
function collectSourceChecks(input, request = null) {
  if (!SHA_RE.test(input.sourceSha || "")) fail("source checks require exact source SHA")
  const repo = process.env.GITHUB_REPOSITORY || ""
  if (!input.runtimePolicy || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail("source checks require runtime policy and GitHub repository")
  const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "storefront-runtime-policies.json"))).policies[input.runtimePolicy]
  if (!policy) fail("unknown runtime policy")
  const api = request || ((suffix, paginate = false) => JSON.parse(execFileSync("gh", ["api",
    ...(paginate ? ["--paginate", "--slurp"] : []), `repos/${repo}/${suffix}`], { encoding: "utf8" })))
  const pages = api(`commits/${input.sourceSha}/check-runs?per_page=100`, true)
  const checks = pages.flatMap(page => page.check_runs)
  const receipts = policy.required_checks.map(name => {
    const check = checks.filter(x => x.name === name && x.app?.slug === "github-actions").sort((a, b) => b.id - a.id)[0]
    if (!check || check.head_sha !== input.sourceSha || check.status !== "completed" || check.conclusion !== "success") fail(`source CI not successful: ${name}`)
    const prefix = `https://github.com/${repo}/actions/runs/`
    if (!String(check.details_url).startsWith(prefix)) fail("source check run URL invalid")
    const match = String(check.details_url).slice(prefix.length).match(/^(\d+)\/job\/\d+$/)
    if (!match) fail("source check run URL invalid")
    const run = api(`actions/runs/${match[1]}`)
    if (run.id !== Number(match[1]) || run.repository?.full_name !== repo ||
        run.path !== policy.required_workflow || run.head_sha !== input.sourceSha ||
        run.event !== policy.source_ci_event || run.head_branch !== policy.source_ci_ref ||
        !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0 ||
        run.check_suite_id !== check.check_suite?.id ||
        run.status !== "completed" || run.conclusion !== "success") fail(`source CI workflow/ref/event mismatch: ${name}`)
    const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs)
    const ownedJobs = jobs.filter(job => job.name === name && job.check_run_url === `https://api.github.com/repos/${repo}/check-runs/${check.id}`)
    if (ownedJobs.length !== 1 || ownedJobs[0].status !== "completed" || ownedJobs[0].conclusion !== "success") fail(`source check belongs to another run attempt: ${name}`)
    return { name, head_sha: check.head_sha, conclusion: check.conclusion, workflow_path: run.path,
      event: run.event, head_branch: run.head_branch, run_id: run.id, run_attempt: run.run_attempt,
      check_id: check.id, source_base_sha: policy.base_sha, source_tree: policy.source_tree }
  })
  validateSourceReceipts(receipts, policy, input.sourceSha)
  fs.writeFileSync(input.sourceChecksFile, JSON.stringify(receipts, null, 2) + "\n")
  return receipts
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
    if (args.runtimePolicy && !args.fetchSourceChecks) fail("runtime CLI requires live source CI collection")
    if (args.fetchSourceChecks) collectSourceChecks(args)
    const result = validateIsolatedStorefrontBake(args)
    if (args.evidenceOutput) fs.writeFileSync(args.evidenceOutput, JSON.stringify(result, null, 2) + "\n")
    if (process.argv.includes("--github-output") && process.env.GITHUB_OUTPUT) {
      const fs = require("fs")
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        [
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
  collectSourceChecks,
}

if (require.main === module) main()
