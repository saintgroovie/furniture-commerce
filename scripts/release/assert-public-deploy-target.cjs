#!/usr/bin/env node
/**
 * Fail-closed gate before public cutover / public health probes.
 * Requires explicit --target-role public_demo and at least one of:
 *   --health-url (canonical public) and/or --identity-file
 */
const fs = require("fs")
const {
  classifyEvidenceUrl,
  validateRuntimeIdentityDoc,
} = require("./runtime-identity-lib.cjs")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function main() {
  if (!hasFlag("--target-role")) {
    console.error(
      JSON.stringify({
        ok: false,
        message: "explicit --target-role required (must be public_demo)",
      })
    )
    process.exit(2)
  }

  const targetRole = arg("--target-role", "")
  const healthUrl = arg("--health-url", "")
  const identityPath = arg("--identity-file", "")

  if (targetRole !== "public_demo") {
    console.error(
      JSON.stringify({
        ok: false,
        message: "deployment target must be public_demo",
        target_role: targetRole,
      })
    )
    process.exit(3)
  }

  if (!healthUrl && !identityPath) {
    console.error(
      JSON.stringify({
        ok: false,
        message: "require --health-url and/or --identity-file for public deploy gate",
      })
    )
    process.exit(2)
  }

  if (healthUrl) {
    const c = classifyEvidenceUrl(healthUrl)
    if (!c.ok_for_public) {
      console.error(
        JSON.stringify({
          ok: false,
          message: "health URL forbidden for public deploy target",
          health_url: healthUrl,
          evidence_class: c.class,
          reasons: c.reasons,
        })
      )
      process.exit(4)
    }
  }

  if (identityPath) {
    const doc = JSON.parse(fs.readFileSync(identityPath, "utf8"))
    const r = validateRuntimeIdentityDoc(doc, { expectRole: "public_demo" })
    if (!r.ok) {
      console.error(
        JSON.stringify({
          ok: false,
          message: "identity file not valid for public_demo",
          errors: r.errors,
        })
      )
      process.exit(5)
    }
    if (doc.database_identity_alias === "non_public_candidate_db") {
      console.error(
        JSON.stringify({
          ok: false,
          message: "candidate DB alias cannot be public deploy target",
        })
      )
      process.exit(6)
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      target_role: "public_demo",
      health_url: healthUrl || null,
      identity_file: identityPath || null,
    })
  )
}

if (process.argv.includes("--self-test")) {
  let failed = 0
  const { spawnSync } = require("child_process")
  const self = __filename
  const run = (args) =>
    spawnSync(process.execPath, [self, ...args], { encoding: "utf8" })

  // empty args must fail
  if (run([]).status === 0) failed++
  // default-less: missing --target-role
  if (run(["--health-url", "https://api.woodright-demo.ru/health"]).status === 0) failed++

  const a = run([
    "--target-role",
    "public_demo",
    "--health-url",
    "https://api.woodright-demo.ru/health",
  ])
  if (a.status !== 0) failed++

  const b = run([
    "--target-role",
    "public_demo",
    "--health-url",
    "http://127.0.0.1:9200/health",
  ])
  if (b.status === 0) failed++

  const c = run(["--target-role", "non_public_candidate", "--health-url", "https://woodright-demo.ru/"])
  if (c.status === 0) failed++

  console.log(failed ? `FAIL self-test (${failed})` : "PASS self-test")
  process.exit(failed ? 1 : 0)
}

main()
