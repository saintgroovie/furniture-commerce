/**
 * After a storefront production build, optionally publish BUILD_ID to the
 * LaunchAgent-readable marker under ~/.woodright so run-storefront-qa.sh can
 * reload without reading Documents/ (TCC often blocks that for launchd).
 *
 * Invoked by `yarn sync:qa-build-marker` / `yarn build:qa` only — not by
 * plain `yarn build` (CI/containers must not depend on macOS QA paths).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const storefrontRoot = join(import.meta.dirname, "..")
const buildIdPath = join(storefrontRoot, ".next-build", "BUILD_ID")
const port = process.env.WOODRIGHT_STOREFRONT_PORT || "3002"
const home = process.env.HOME || ""
const qaDir =
  process.env.WOODRIGHT_QA_DIR ||
  (home ? join(home, ".woodright/qa-dev-servers") : "")
const markerPath = qaDir ? join(qaDir, `storefront-${port}.build-id`) : ""

if (!qaDir || !markerPath) {
  console.warn(
    "sync-qa-build-marker: skip (HOME/WOODRIGHT_QA_DIR unset) - not a QA host",
  )
  process.exit(0)
}

if (!existsSync(buildIdPath)) {
  console.error("sync-qa-build-marker: missing", buildIdPath)
  process.exit(1)
}

const id = readFileSync(buildIdPath, "utf8").trim()
if (!id) {
  console.error("sync-qa-build-marker: empty BUILD_ID")
  process.exit(1)
}

try {
  mkdirSync(qaDir, { recursive: true })
  writeFileSync(markerPath, `${id}\n`, "utf8")
  console.log("sync-qa-build-marker: wrote", markerPath, "->", id)
} catch (err) {
  console.warn(
    "sync-qa-build-marker: skip write failed (non-fatal for CI):",
    err instanceof Error ? err.message : err,
  )
  process.exit(0)
}
