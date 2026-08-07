#!/usr/bin/env node
/**
 * Fidelity for scripts/release/scan-public-demo-actual-artifact.cjs
 *
 *   node scripts/release/scan-public-demo-actual-artifact.fidelity.test.cjs
 */
"use strict"

const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = path.resolve(__dirname, "../..")
const SCRIPT = path.join(__dirname, "scan-public-demo-actual-artifact.cjs")
const {
  countNeedleInTree,
  assertBuildRoot,
  FORBIDDEN,
} = require("./scan-public-demo-actual-artifact.cjs")

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-actual-fid-"))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// self-test mode
{
  const r = spawnSync(process.execPath, [SCRIPT, "--self-test"], {
    encoding: "utf8",
    cwd: ROOT,
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /self-test: ok/)
}

withTmp((dir) => {
  const dirty = path.join(dir, "standalone")
  fs.mkdirSync(path.join(dirty, "chunks"), { recursive: true })
  fs.writeFileSync(
    path.join(dirty, "chunks/a.js"),
    'const x="https://woodright.ru";'
  )
  fs.writeFileSync(
    path.join(dirty, "chunks/b.js"),
    'const y="https://woodright.ru"; const z="https://woodright.ru";'
  )
  const hits = countNeedleInTree(dirty, FORBIDDEN)
  assert.equal(hits.length, 3)
  assert.deepEqual(
    hits.map((h) => h.file),
    ["chunks/a.js", "chunks/b.js", "chunks/b.js"]
  )
})

withTmp((dir) => {
  const clean = path.join(dir, "standalone")
  fs.mkdirSync(path.join(clean, "chunks"), { recursive: true })
  fs.writeFileSync(
    path.join(clean, "chunks/ok.js"),
    'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";'
  )
  assert.equal(countNeedleInTree(clean, FORBIDDEN).length, 0)
  const report = path.join(dir, "report.json")
  const r = spawnSync(
    process.execPath,
    [SCRIPT, "--standalone", clean],
    {
      encoding: "utf8",
      cwd: ROOT,
      env: { ...process.env, WOODRIGHT_ACTUAL_ARTIFACT_REPORT: report },
    }
  )
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stderr, /PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS = 0/)
  const j = JSON.parse(fs.readFileSync(report, "utf8"))
  assert.equal(j.PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS, 0)
  assert.equal(j.ok, true)
})

withTmp((dir) => {
  const dirty = path.join(dir, "standalone")
  fs.mkdirSync(path.join(dirty, "chunks"), { recursive: true })
  fs.writeFileSync(
    path.join(dirty, "chunks/x.js"),
    'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const BAD="https://woodright.ru";'
  )
  const r = spawnSync(process.execPath, [SCRIPT, "--standalone", dirty], {
    encoding: "utf8",
    cwd: ROOT,
  })
  assert.equal(r.status, 1)
  assert.match(r.stderr + r.stdout, /PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS = 1/)
})

withTmp((dir) => {
  assert.throws(() => assertBuildRoot(path.join(dir, "missing"), "standalone"))
  const target = path.join(dir, "real")
  fs.mkdirSync(target)
  const link = path.join(dir, "link")
  fs.symlinkSync(target, link)
  assert.throws(() => assertBuildRoot(link, "standalone"))
})

// Binary-ish file: scanner skips non-text extensions; .js with null bytes still scanned safely
withTmp((dir) => {
  const root = path.join(dir, "standalone")
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, "bin.js"), Buffer.from([0, 1, 2, 3, 4]))
  assert.equal(countNeedleInTree(root, FORBIDDEN).length, 0)
})

console.log("scan-public-demo-actual-artifact.fidelity: ok")
