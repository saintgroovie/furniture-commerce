#!/usr/bin/env node
/**
 * Fidelity tests for the image-build-profile system:
 *   - ops/config/image-build-profiles/{public_demo,production_candidate}.conf
 *   - scripts/release/resolve-image-build-profile.cjs
 *   - apps/storefront/Dockerfile (profile-aware launch validation)
 *   - .github/workflows/build-staging-images.yml wiring
 *
 * Invoked from PR checks release-governance job (plain node, no yarn dlx).
 *
 *   node scripts/release/image-build-profile.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const resolverPath = path.join(root, "scripts/release/resolve-image-build-profile.cjs")
const {
  loadProfile,
  resolveProfile,
  validateProfileValues,
} = require(resolverPath)

let failed = 0
function check(cond, msg) {
  if (cond) {
    console.log("PASS", msg)
  } else {
    console.error("FAIL", msg)
    failed++
  }
}

// 1. Self-test suite embedded in the resolver must pass on its own.
{
  const r = spawnSync("node", [resolverPath, "--self-test"], { cwd: root, encoding: "utf8" })
  check(r.status === 0, `resolve-image-build-profile.cjs --self-test (${(r.stderr || "").trim() || "ok"})`)
}

// 2. CLI fail-closed behavior: missing / unknown profile.
{
  const r = spawnSync("node", [resolverPath, "--profile", "nope"], { cwd: root, encoding: "utf8" })
  check(r.status === 1 && /FAIL_CLOSED/.test(r.stderr), "CLI rejects unknown profile with exit 1")
}
{
  const r = spawnSync("node", [resolverPath], { cwd: root, encoding: "utf8" })
  check(r.status === 2, "CLI usage error (missing --profile) exits 2")
}

// 3. CLI --print-env / --checksum output shape for both profiles.
for (const name of ["public_demo", "production_candidate"]) {
  const r = spawnSync("node", [resolverPath, "--profile", name, "--print-env", "--checksum"], {
    cwd: root,
    encoding: "utf8",
  })
  check(r.status === 0, `CLI resolves ${name} with --print-env --checksum`)
  check(
    new RegExp(`WOODRIGHT_RESOLVED_PROFILE=${name}$`, "m").test(r.stdout),
    `${name} --print-env includes WOODRIGHT_RESOLVED_PROFILE`
  )
  check(/WOODRIGHT_PROFILE_CHECKSUM=[0-9a-f]{64}/.test(r.stdout), `${name} --print-env includes 64-hex checksum`)
}

// 4. Conf files: non-secret KEY=value, correct forbidden-substring direction per profile.
const demo = loadProfile("public_demo")
const prod = loadProfile("production_candidate")
check(demo.values.NEXT_PUBLIC_SITE_URL === "https://woodright-demo.ru", "public_demo.conf site url")
check(prod.values.NEXT_PUBLIC_SITE_URL === "https://woodright.ru", "production_candidate.conf site url")
check(
  (demo.values.WOODRIGHT_FORBIDDEN_SITE_SUBSTRINGS || "").includes("woodright.ru"),
  "public_demo.conf forbids production apex substring"
)
check(!/=.*\b(ghp_|sk_live_|-----BEGIN)/i.test(demo.text), "public_demo.conf has no secret-looking values")
check(!/=.*\b(ghp_|sk_live_|-----BEGIN)/i.test(prod.text), "production_candidate.conf has no secret-looking values")

// 5. Cross-profile guard rails via the exported pure validator (belt-and-braces
//    beyond the resolver's own --self-test, pinned to this repo's checked-in files).
{
  const mutated = { ...prod.values, NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru" }
  const errors = validateProfileValues("production_candidate", mutated)
  check(errors.length > 0, "production_candidate rejects mutated demo site url")
}
{
  const resolved = resolveProfile("public_demo")
  check(resolved.ok, "public_demo resolves clean from disk")
}

// 6. Dockerfile is profile-aware (RCA fix: WOODRIGHT_LAUNCH_MODE alone used to
//    force woodright.ru regardless of profile).
const dockerfile = fs.readFileSync(path.join(root, "apps/storefront/Dockerfile"), "utf8")
check(/ARG WOODRIGHT_IMAGE_BUILD_PROFILE=/.test(dockerfile), "Dockerfile declares WOODRIGHT_IMAGE_BUILD_PROFILE ARG")
check(
  /production_candidate/.test(dockerfile) && /public_demo/.test(dockerfile),
  "Dockerfile launch validation branches on both profiles"
)
check(
  /ARG WOODRIGHT_RUNTIME_ROLE=/.test(dockerfile) && /ARG WOODRIGHT_RUNTIME_EXPOSURE=/.test(dockerfile),
  "Dockerfile passes through runtime identity ARGs for OCI/runtime evidence"
)

// 7. Workflow wiring: build_profile is a required choice input, resolver runs
//    fail-closed before the builds, and site URL never comes from a secret.
const wfPath = path.join(root, ".github/workflows/build-staging-images.yml")
const wf = fs.readFileSync(wfPath, "utf8")
check(/build_profile:/.test(wf), "workflow declares build_profile input")
check(/type: choice/.test(wf), "workflow build_profile is a choice input")
check(/resolve-image-build-profile\.cjs/.test(wf), "workflow calls resolve-image-build-profile.cjs")
check(
  !/NEXT_PUBLIC_SITE_URL:\s*\$\{\{\s*secrets\./.test(wf),
  "workflow never sources NEXT_PUBLIC_SITE_URL from a secret (RCA fix)"
)
check(/woodright\.image\.build_profile/.test(wf), "workflow labels images with woodright.image.build_profile")

process.exit(failed ? 1 : 0)
