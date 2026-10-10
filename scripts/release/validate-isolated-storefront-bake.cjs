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
  const reasons = files.map(rejectionReason).filter(Boolean)
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
  }
}

function main() {
  try {
    const result = validateIsolatedStorefrontBake(parseArgs(process.argv.slice(2)))
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
}

if (require.main === module) main()
