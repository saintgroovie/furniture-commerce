#!/usr/bin/env node
/**
 * CI-only actual Next artifact gate for public_demo production-apex isolation.
 *
 * Unlike source-graph / esbuild fidelity proxies, this scans the REAL
 * `.next-build` standalone + static output after a public_demo-identity build.
 *
 * Failed bake authority: run 31082069745 / chunk 5052.js —
 * contiguous `https://woodright.ru` must be 0.
 *
 * Usage:
 *   node scripts/release/scan-public-demo-actual-artifact.cjs \
 *     --standalone <path> [--static <path>]
 *   node scripts/release/scan-public-demo-actual-artifact.cjs --self-test
 *
 * Env (optional reporting):
 *   WOODRIGHT_ACTUAL_ARTIFACT_REPORT=<path.json>
 *
 * Exit: 0 clean | 1 contaminated / missing output / usage
 */
"use strict"

const fs = require("fs")
const path = require("path")
const os = require("os")
const {
  scanDirectories,
  scanFileMap,
} = require("./scan-storefront-contamination.cjs")

const FORBIDDEN = "https://woodright.ru"
const PROFILE = "public_demo"

function parseArgs(argv) {
  const out = { standalone: null, staticPath: null, selfTest: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--self-test") out.selfTest = true
    else if (a === "--standalone") out.standalone = argv[++i]
    else if (a === "--static") out.staticPath = argv[++i]
    else if (a === "--help" || a === "-h") out.help = true
    else throw new Error(`Unknown arg: ${a}`)
  }
  return out
}

function assertBuildRoot(p, label) {
  if (!p || !fs.existsSync(p)) {
    throw new Error(`missing ${label} build root: ${p || "<empty>"}`)
  }
  const st = fs.lstatSync(p)
  if (st.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${p}`)
  }
  if (!st.isDirectory()) {
    throw new Error(`${label} is not a directory: ${p}`)
  }
}

function countNeedleInTree(root, needle) {
  const hits = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      throw new Error(`readdir failed for ${dir}: ${e.message}`)
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!/\.(js|mjs|cjs|html|json)$/i.test(entry.name)) continue
      const size = fs.statSync(full).size
      if (size > 40_000_000) continue
      const buf = fs.readFileSync(full)
      let start = 0
      while (true) {
        const i = buf.indexOf(needle, start)
        if (i < 0) break
        hits.push({
          file: path.relative(root, full).split(path.sep).join("/"),
          offset: i,
        })
        start = i + needle.length
      }
    }
  }
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.offset - b.offset)
  return hits
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-actual-artifact-"))
  try {
    const clean = path.join(dir, "clean")
    const dirty = path.join(dir, "dirty")
    fs.mkdirSync(path.join(clean, "server/chunks"), { recursive: true })
    fs.mkdirSync(path.join(dirty, "server/chunks"), { recursive: true })
    fs.writeFileSync(
      path.join(clean, "server/chunks/ok.js"),
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";'
    )
    fs.writeFileSync(
      path.join(dirty, "server/chunks/5052.js"),
      'let f="https://woodright.ru";function g(){return f}'
    )
    fs.writeFileSync(
      path.join(dirty, "server/chunks/extra.js"),
      'const x="https://woodright.ru"; const y="https://woodright.ru";'
    )
    fs.writeFileSync(
      path.join(dirty, "marker.js"),
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";'
    )

    const cleanHits = countNeedleInTree(clean, FORBIDDEN)
    if (cleanHits.length !== 0) throw new Error("self-test: clean tree should be 0 hits")

    const dirtyHits = countNeedleInTree(dirty, FORBIDDEN)
    if (dirtyHits.length !== 3) {
      throw new Error(`self-test: expected 3 dirty hits, got ${dirtyHits.length}`)
    }
    if (dirtyHits[0].file !== "server/chunks/5052.js") {
      throw new Error("self-test: sorted paths must start with 5052.js")
    }

    // Missing root
    let missingOk = false
    try {
      assertBuildRoot(path.join(dir, "nope"), "standalone")
    } catch {
      missingOk = true
    }
    if (!missingOk) throw new Error("self-test: missing root must throw")

    // Symlink escape rejected
    const link = path.join(dir, "link")
    fs.symlinkSync(clean, link)
    let symOk = false
    try {
      assertBuildRoot(link, "standalone")
    } catch {
      symOk = true
    }
    if (!symOk) throw new Error("self-test: symlink root must throw")

    // Delegate profile scan on clean map
    const mapScan = scanFileMap(PROFILE, {
      "chunks/ok.js":
        'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";',
    })
    if (!mapScan.ok) throw new Error(`self-test mapScan failed: ${JSON.stringify(mapScan)}`)

    console.log("scan-public-demo-actual-artifact.self-test: ok")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log(
      "Usage: node scripts/release/scan-public-demo-actual-artifact.cjs --standalone <dir> [--static <dir>]\n" +
        "       node scripts/release/scan-public-demo-actual-artifact.cjs --self-test"
    )
    process.exit(0)
  }
  if (args.selfTest) {
    runSelfTest()
    return
  }
  if (!args.standalone) {
    console.error("--standalone is required (or --self-test)")
    process.exit(1)
  }
  assertBuildRoot(args.standalone, "standalone")
  const paths = [args.standalone]
  if (args.staticPath) {
    assertBuildRoot(args.staticPath, "static")
    paths.push(args.staticPath)
  }

  const apexHits = []
  for (const root of paths) {
    for (const hit of countNeedleInTree(root, FORBIDDEN)) {
      apexHits.push({ root: path.resolve(root), ...hit })
    }
  }

  const result = scanDirectories(PROFILE, paths)
  const report = {
    ok: result.ok && apexHits.length === 0,
    profile: PROFILE,
    PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS: apexHits.length,
    apexHits,
    contamination: result,
  }
  const reportPath = process.env.WOODRIGHT_ACTUAL_ARTIFACT_REPORT
  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
  }
  console.log(JSON.stringify(report, null, 2))
  if (apexHits.length !== 0) {
    console.error(
      `PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS = ${apexHits.length}`
    )
    process.exit(1)
  }
  if (!result.ok) {
    process.exit(1)
  }
  console.error("PUBLIC_DEMO_ACTUAL_ARTIFACT_PRODUCTION_APEX_HITS = 0")
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(String(err && err.message ? err.message : err))
    process.exit(1)
  }
}

module.exports = {
  FORBIDDEN,
  countNeedleInTree,
  assertBuildRoot,
}
