#!/usr/bin/env node
/**
 * Fidelity tests for scripts/release/scan-storefront-contamination.cjs and
 * its wiring into .github/workflows/build-staging-images.yml (the gate must
 * run BEFORE the storefront image is pushed, on the actual compiled bytes).
 *
 * Invoked from PR checks release-governance job (plain node, no yarn dlx).
 *
 *   node scripts/release/scan-storefront-contamination.fidelity.test.cjs
 */
"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const scannerPath = path.join(root, "scripts/release/scan-storefront-contamination.cjs")
const { scanDirectory } = require(scannerPath)

let failed = 0
function check(cond, msg) {
  if (cond) {
    console.log("PASS", msg)
  } else {
    console.error("FAIL", msg)
    failed++
  }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-contamination-fidelity-"))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function writeFixture(dir, rel, content) {
  const full = path.join(dir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf8")
}

// 1. Self-test suite embedded in the scanner must pass on its own.
{
  const r = spawnSync("node", [scannerPath, "--self-test"], { cwd: root, encoding: "utf8" })
  check(r.status === 0, `scan-storefront-contamination.cjs --self-test (${(r.stderr || "").trim() || "ok"})`)
}

// 2. CLI usage error when --profile/--path missing.
{
  const r = spawnSync("node", [scannerPath], { cwd: root, encoding: "utf8" })
  check(r.status === 1, "CLI usage error (missing --profile/--path) exits non-zero")
}

// 3. CLI end-to-end: a real synthetic bundle on disk, invoked as a subprocess
//    (mirrors exactly how the workflow step calls it after `docker create`/`cp`).
withTmpDir((dir) => {
  writeFixture(
    dir,
    "standalone/chunks/app.js",
    'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";'
  )
  const r = spawnSync(
    "node",
    [scannerPath, "--profile", "production_candidate", "--path", path.join(dir, "standalone")],
    { cwd: root, encoding: "utf8" }
  )
  check(r.status === 0, "CLI clean production_candidate bundle exits 0")
  check(/CONTAMINATION_GATE_OK/.test(r.stdout), "CLI prints CONTAMINATION_GATE_OK on success")
})

withTmpDir((dir) => {
  writeFixture(
    dir,
    "standalone/chunks/app.js",
    'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";const LEGACY="https://woodright-demo.ru";'
  )
  const r = spawnSync(
    "node",
    [scannerPath, "--profile", "production_candidate", "--path", path.join(dir, "standalone")],
    { cwd: root, encoding: "utf8" }
  )
  check(r.status === 1, "CLI contaminated production_candidate bundle exits non-zero")
  check(/CONTAMINATION_GATE_FAILED/.test(r.stderr), "CLI prints CONTAMINATION_GATE_FAILED on contamination")
})

// 4. Directly via the exported scanDirectory: production apex leak into a
//    public_demo bundle must fail (opposite-direction cross-contamination).
withTmpDir((dir) => {
  writeFixture(
    dir,
    "app.js",
    'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const WRONG="https://woodright.ru";'
  )
  const r = scanDirectory("public_demo", dir)
  check(!r.ok, "public_demo bundle leaking production apex host fails")
})

// 5. Unknown profile refuses to scan at all (fail-closed, no partial result).
{
  let threw = false
  try {
    scanDirectory("staging", os.tmpdir())
  } catch {
    threw = true
  }
  check(threw, "scanDirectory refuses unknown profile")
}

// 6. Workflow wiring: contamination gate must run on the ACTUAL compiled
//    bytes (extracted from a local, unpushed build) before the storefront
//    image is pushed - not after, and not only against build-arg values.
const wfPath = path.join(root, ".github/workflows/build-staging-images.yml")
const wf = fs.readFileSync(wfPath, "utf8")
const scanRef = wf.indexOf("scan-storefront-contamination.cjs")
check(scanRef !== -1, "workflow references scan-storefront-contamination.cjs")

const pushIdxCandidates = [
  wf.indexOf("Push storefront"),
  wf.lastIndexOf("docker/build-push-action"),
]
const storefrontPushIdx = Math.max(...pushIdxCandidates.filter((i) => i !== -1))
check(
  scanRef !== -1 && storefrontPushIdx !== -1 && scanRef < storefrontPushIdx,
  "contamination gate step appears before the storefront push step in workflow source order"
)
check(
  /load:\s*true/.test(wf) && /docker create/.test(wf) && /docker push/.test(wf),
  "workflow loads one storefront image, scans via docker create, then pushes without rebuild"
)
check(
  /Push the already-built storefront image/.test(wf),
  "workflow push step reuses the scanned local image (no second docker build)"
)
check(
  /\.next-build\/static/.test(wf),
  "contamination gate also scans .next-build/static (not only standalone)"
)
check(
  /--path \/tmp\/woodright-sf-gate\/standalone/.test(wf) && /--path \/tmp\/woodright-sf-gate\/static/.test(wf),
  "contamination gate passes both standalone and static --path roots"
)

// 7. Multi-root scan: contamination only in static tree must still fail.
{
  const { scanDirectories } = require(scannerPath)
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "standalone/server.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";'
    )
    writeFixture(dir, "static/chunks/app.js", 'const LEGACY="https://woodright-demo.ru";')
    const r = scanDirectories("production_candidate", [
      path.join(dir, "standalone"),
      path.join(dir, "static"),
    ])
    check(!r.ok, "contamination only in static tree fails multi-root scan")
  })
}

process.exit(failed ? 1 : 0)
