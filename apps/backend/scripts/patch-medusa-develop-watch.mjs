#!/usr/bin/env node
/**
 * Extends chokidar ignore-list in `medusa develop` (static/tmp/uploads/…
 * plus package.json, yarn.lock, top-level scripts/).
 * Idempotent. Used from postinstall and scripts/local-dev entrypoint.
 *
 * Note: ignored `scripts/` means changes under apps/backend/scripts require an
 * explicit restart to take effect while develop is running.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const developPath = path.resolve(
  __dirname,
  "../node_modules/@medusajs/medusa/dist/commands/develop.js",
)

const MARKER = "Woodright: develop watch ignores"
const EXTRA_IGNORES = [
  "tmp",
  "uploads",
  "static",
  "test-results",
  "src/scripts",
  "scripts",
  "package.json",
  "yarn.lock",
  ".run",
  "data",
  ".cursor",
  "coverage",
]
const LEGACY_NEEDLE = `"src/admin",
                    ".medusa",
                ],`
const LEGACY_REPLACEMENT = `"src/admin",
                    ".medusa",
                    "tmp",
                    "uploads",
                    "static",
                    "test-results",
                    "src/scripts",
                    "scripts",
                    "package.json",
                    "yarn.lock",
                ], // ${MARKER}`

function patchDevelopWatch(source) {
  if (source.includes(MARKER)) {
    return { source, status: "already" }
  }
  if (source.includes(LEGACY_NEEDLE)) {
    return {
      source: source.replace(LEGACY_NEEDLE, LEGACY_REPLACEMENT),
      status: "patched-legacy",
    }
  }
  const ignoredBlock =
    /(ignored:\s*\[[\s\S]*?"\.medusa",\s*\])(,?)(\s*\))/
  const match = source.match(ignoredBlock)
  if (!match) {
    return { source, status: "pattern-missing" }
  }
  const block = match[1]
  const missing = EXTRA_IGNORES.filter((entry) => !block.includes(`"${entry}"`))
  if (missing.length === 0) {
    const marked = source.replace(ignoredBlock, `$1$2$3 // ${MARKER}`)
    return { source: marked, status: "marked-only" }
  }
  const injection = missing.map((entry) => `\n                    "${entry}",`).join("")
  const patchedBlock = block.replace(/"\.medusa",/, `".medusa",${injection}`)
  const patched = source.replace(ignoredBlock, `${patchedBlock}$2$3 // ${MARKER}`)
  return { source: patched, status: "patched" }
}

function upgradeMarkedSource(source) {
  const ignoredBlock =
    /(ignored:\s*\[[\s\S]*?)(\],\s*\/\/\s*Woodright: develop watch ignores)/
  const match = source.match(ignoredBlock)
  if (!match) {
    return { source, status: "already", missing: [] }
  }
  const block = match[1]
  const missing = EXTRA_IGNORES.filter((entry) => !block.includes(`"${entry}"`))
  if (missing.length === 0) {
    return { source, status: "already", missing: [] }
  }
  const injection = missing.map((entry) => `\n                    "${entry}",`).join("")
  const patchedBlock = block.includes('"src/scripts",')
    ? block.replace(/"src\/scripts",/, `"src/scripts",${injection}`)
    : block.replace(/"\.medusa",/, `".medusa",${injection}`)
  return {
    source: source.replace(ignoredBlock, `${patchedBlock}${match[2]}`),
    status: "upgraded",
    missing,
  }
}

if (!fs.existsSync(developPath)) {
  console.warn(`skip: missing ${developPath}`)
  process.exit(0)
}

const original = fs.readFileSync(developPath, "utf8")
const result = patchDevelopWatch(original)

if (result.status === "already") {
  const upgraded = upgradeMarkedSource(fs.readFileSync(developPath, "utf8"))
  if (upgraded.status === "already") {
    console.log("already patched medusa develop watch")
    process.exit(0)
  }
  fs.writeFileSync(developPath, upgraded.source)
  console.log(`patched medusa develop watch (added: ${upgraded.missing.join(", ")})`)
  process.exit(0)
}

if (result.status === "pattern-missing") {
  const message =
    "develop.js watch ignore pattern not found - check @medusajs/medusa version and update patch-medusa-develop-watch.mjs"
  if (process.argv.includes("--warn-only")) {
    console.warn(`warn: ${message}`)
    process.exit(0)
  }
  console.error(`error: ${message}`)
  process.exit(1)
}

fs.writeFileSync(developPath, result.source)
console.log(`patched medusa develop watch (${result.status})`)
