#!/usr/bin/env node
/**
 * Post-build contamination gate for a built storefront tree (Next.js
 * standalone output or any extracted image filesystem).
 *
 * Runs AFTER `apps/storefront/Dockerfile`'s own build-arg validation, on the
 * ACTUAL compiled bytes, so a baked-in demo/loopback host (or a missing
 * launch-contract marker) is caught before the image is published - not just
 * trusted from the build-arg values passed in.
 *
 * Usage:
 *   node scripts/release/scan-storefront-contamination.cjs \
 *     --profile production_candidate|public_demo \
 *     --path <standalone_dir> [--path <static_dir> ...]
 *   node scripts/release/scan-storefront-contamination.cjs --self-test
 *
 * Pass every runtime-shipped tree that may contain baked NEXT_PUBLIC_* bytes.
 * Official workflow must scan BOTH Next standalone output AND `.next-build/static`
 * (the published image copies both; scanning only standalone would miss browser chunks).
 *
 * production_candidate filesystem gate:
 *   FAIL on https?://woodright-demo.ru, 127.0.0.1:3200, public_demo_db,
 *   WOODRIGHT_RUNTIME_ROLE=public_demo (scheme-qualified / identity markers).
 *   Bare demo-host deny-lists and Next localhost polyfills are allowed.
 *   REQUIRE https://woodright.ru, https://api.woodright.ru, private_noindex,
 *   manual_invoice (the latter may arrive via woodright-bake-evidence.json).
 *
 * public_demo filesystem gate:
 *   FAIL on https://woodright.ru / www / api.woodright.ru as baked apex URLs.
 *   REQUIRE https://woodright-demo.ru, https://api.woodright-demo.ru,
 *   private_noindex, manual_invoice.
 *
 * Exit codes: 0 clean | 1 contamination found / usage / profile invalid
 */
"use strict"

const fs = require("fs")
const path = require("path")
const os = require("os")

const { ALLOWED_PROFILES, loadProfile, validateProfileValues } = require("./resolve-image-build-profile.cjs")

const SCAN_EXTENSIONS = [".js", ".mjs", ".cjs", ".html", ".json"]

function walkFiles(root, extensions) {
  const out = []
  const stack = [root]
  const ioErrors = []
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      ioErrors.push(`readdir failed for ${dir}: ${e.message}`)
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        out.push(full)
      }
    }
  }
  if (ioErrors.length) {
    throw new Error(`contamination walk I/O failures (fail-closed): ${ioErrors.join("; ")}`)
  }
  return out
}

/**
 * Post-build filesystem needles are intentionally DIFFERENT from profile-value
 * forbidden substrings (WOODRIGHT_FORBIDDEN_SITE_SUBSTRINGS). Profile values
 * reject bare localhost/demo hosts in SITE/API URLs. The filesystem gate must
 * not false-fail on:
 *   - launch-contract DEMO_HOSTS deny-lists (bare woodright-demo.ru)
 *   - Next.js polyfills mentioning localhost
 *   - media URL helpers rewriting medusa→localhost
 * User §8 forbidden list (scheme-qualified + private bind + demo identity):
 */
function filesystemForbiddenNeedles(profile) {
  if (profile === "production_candidate") {
    return [
      "https://woodright-demo.ru",
      "http://woodright-demo.ru",
      "127.0.0.1:3200",
      // Contaminated identity bake (not allowlists that merely mention known aliases).
      "WOODRIGHT_DB_ALIAS=public_demo_db",
      'WOODRIGHT_DB_ALIAS":"public_demo_db"',
      'WOODRIGHT_RUNTIME_ROLE":"public_demo"',
      "WOODRIGHT_RUNTIME_ROLE=public_demo",
    ]
  }
  // public_demo must not bake the production apex as the site/API URL.
  return ["https://woodright.ru", "https://www.woodright.ru", "https://api.woodright.ru"]
}

function requiredMarkersFor(profile) {
  if (profile === "production_candidate") {
    return ["https://woodright.ru", "https://api.woodright.ru", "private_noindex", "manual_invoice"]
  }
  return ["https://woodright-demo.ru", "https://api.woodright-demo.ru", "private_noindex", "manual_invoice"]
}

/**
 * Pure scan over an in-memory file map ({relPath: content}) - used by both
 * the real filesystem walk and the self-test fixtures, so the detection
 * logic is exercised identically in both paths.
 */
function scanFileMap(profile, fileMap) {
  const errors = []
  const forbidden = filesystemForbiddenNeedles(profile)
  const requiredMarkers = requiredMarkersFor(profile)
  const foundRequired = new Set()
  const forbiddenHits = []

  for (const [rel, text] of Object.entries(fileMap)) {
    const lower = text.toLowerCase()
    for (const bad of forbidden) {
      if (bad && lower.includes(bad.toLowerCase())) {
        forbiddenHits.push({ file: rel, needle: bad })
      }
    }
    for (const marker of requiredMarkers) {
      if (text.includes(marker)) foundRequired.add(marker)
    }
  }

  for (const hit of forbiddenHits) {
    errors.push(`forbidden substring "${hit.needle}" found in ${hit.file}`)
  }
  for (const marker of requiredMarkers) {
    if (!foundRequired.has(marker)) {
      errors.push(`required launch-contract marker missing from bundle: "${marker}"`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    filesScanned: Object.keys(fileMap).length,
    forbiddenHits,
    requiredMarkersFound: [...foundRequired],
    requiredMarkersExpected: requiredMarkers,
  }
}

function scanDirectory(profile, targetPath) {
  return scanDirectories(profile, [targetPath])
}

/**
 * Scan one or more roots and merge results. Official gate must cover BOTH
 * Next standalone server output AND `.next-build/static` browser chunks -
 * the published image copies both (see apps/storefront/Dockerfile).
 */
function scanDirectories(profile, targetPaths) {
  if (!ALLOWED_PROFILES.has(profile)) {
    throw new Error(`unknown profile "${profile}" (allowed: ${[...ALLOWED_PROFILES].join("|")})`)
  }
  const profileErrors = validateProfileValues(profile, loadProfile(profile).values)
  if (profileErrors.length) {
    throw new Error(`profile "${profile}" failed validation, refusing to scan: ${profileErrors.join("; ")}`)
  }
  const roots = (Array.isArray(targetPaths) ? targetPaths : [targetPaths]).filter(Boolean)
  if (!roots.length) {
    throw new Error("scanDirectories requires at least one path")
  }

  const fileMap = {}
  const resolvedRoots = []
  for (const targetPath of roots) {
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      throw new Error(`scan path does not exist or is not a directory: ${targetPath}`)
    }
    const abs = path.resolve(targetPath)
    resolvedRoots.push(abs)
    for (const file of walkFiles(abs, SCAN_EXTENSIONS)) {
      try {
        // Prefix with root basename so collisions across trees stay distinct.
        fileMap[`${path.basename(abs)}/${path.relative(abs, file)}`] = fs.readFileSync(file, "utf8")
      } catch (e) {
        throw new Error(`contamination read failed for ${file}: ${e.message}`)
      }
    }
  }
  const result = scanFileMap(profile, fileMap)
  return { ...result, profile, path: resolvedRoots[0], paths: resolvedRoots }
}

// ---------------------------------------------------------------------------
// Self-test (synthetic fixtures under a tmp dir - no real build required)
// ---------------------------------------------------------------------------

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-contamination-selftest-"))
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

function runSelfTest() {
  const cases = []
  const record = (name, ok) => cases.push([name, !!ok])

  // 1. Clean production_candidate bundle passes.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";'
    )
    const r = scanDirectory("production_candidate", dir)
    record("clean production_candidate bundle passes", r.ok)
  })

  // 2. production_candidate bundle leaking demo host fails.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";const LEGACY="https://woodright-demo.ru";'
    )
    const r = scanDirectory("production_candidate", dir)
    record("production_candidate + demo leak fails", !r.ok && r.forbiddenHits.length > 0)
  })

  // 3. production_candidate bundle leaking loopback fails.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";const DEV="http://127.0.0.1:3200";'
    )
    const r = scanDirectory("production_candidate", dir)
    record("production_candidate + loopback leak fails", !r.ok)
  })

  // 4. production_candidate bundle missing required markers fails.
  withTmpDir((dir) => {
    writeFixture(dir, "chunks/app.js", 'const SITE="https://woodright.ru";')
    const r = scanDirectory("production_candidate", dir)
    record(
      "production_candidate missing markers fails",
      !r.ok && r.errors.some((e) => e.includes("private_noindex"))
    )
  })

  // 5. Clean public_demo bundle passes, including a DEMO_HOSTS-style array.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const DEMO_HOSTS=["woodright-demo.ru","www.woodright-demo.ru","api.woodright-demo.ru"];'
    )
    const r = scanDirectory("public_demo", dir)
    record("clean public_demo bundle (with DEMO_HOSTS array) passes", r.ok)
  })

  // 6. public_demo bundle leaking the production apex fails.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const WRONG="https://woodright.ru";'
    )
    const r = scanDirectory("public_demo", dir)
    record("public_demo + production apex leak fails", !r.ok && r.forbiddenHits.length > 0)
  })

  // 7. public_demo bundle missing required markers fails.
  withTmpDir((dir) => {
    writeFixture(dir, "chunks/app.js", 'const X="nothing relevant here";')
    const r = scanDirectory("public_demo", dir)
    record("public_demo missing markers fails", !r.ok)
  })

  // 8. .map sourcemaps are not scanned; scheme-qualified demo URL there must not fail.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";'
    )
    writeFixture(dir, "chunks/app.js.map", '{"sources":["https://woodright-demo.ru/src.ts"]}')
    const r = scanDirectory("production_candidate", dir)
    record("non-scanned extensions are not gated", r.ok)
  })

  // 8b. Bare demo-host deny-list + localhost polyfill noise must NOT fail production.
  withTmpDir((dir) => {
    writeFixture(
      dir,
      "chunks/app.js",
      'const SITE="https://woodright.ru";const API="https://api.woodright.ru";const MODE="private_noindex";const PAY="manual_invoice";const DEMO_HOSTS=["woodright-demo.ru"];const re=/localhost|127\\.0\\.0\\.1/;'
    )
    const r = scanDirectory("production_candidate", dir)
    record("bare demo-host deny-list and localhost noise do not fail production", r.ok)
  })

  // 9. Unknown profile throws.
  try {
    scanDirectory("staging", os.tmpdir())
    record("unknown profile throws", false)
  } catch {
    record("unknown profile throws", true)
  }

  // 10. Missing path throws.
  try {
    scanDirectory("production_candidate", path.join(os.tmpdir(), "wr-does-not-exist-" + Date.now()))
    record("missing scan path throws", false)
  } catch {
    record("missing scan path throws", true)
  }

  let failed = 0
  for (const [name, ok] of cases) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
    if (!ok) failed++
  }
  return failed === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--self-test")) {
    process.exit(runSelfTest())
  }

  const profileIdx = args.indexOf("--profile")
  const profile = profileIdx !== -1 ? args[profileIdx + 1] : undefined
  const targetPaths = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      targetPaths.push(args[i + 1])
      i++
    }
  }

  if (!profile || !targetPaths.length) {
    console.error(
      "usage: scan-storefront-contamination.cjs --profile <production_candidate|public_demo> --path <dir> [--path <dir> ...]"
    )
    console.error("       scan-storefront-contamination.cjs --self-test")
    process.exit(1)
  }

  let result
  try {
    result = scanDirectories(
      profile,
      targetPaths.map((p) => path.resolve(p))
    )
  } catch (e) {
    console.error(`FAIL_CLOSED ${e.message}`)
    process.exit(1)
  }

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) {
    console.error(`CONTAMINATION_GATE_FAILED profile=${profile} paths=${targetPaths.join(",")}`)
    process.exit(1)
  }
  console.log(`CONTAMINATION_GATE_OK profile=${profile} files_scanned=${result.filesScanned} roots=${targetPaths.length}`)
  process.exit(0)
}

if (require.main === module) main()

module.exports = {
  scanDirectory,
  scanDirectories,
  scanFileMap,
  walkFiles,
  requiredMarkersFor,
  filesystemForbiddenNeedles,
  SCAN_EXTENSIONS,
}
