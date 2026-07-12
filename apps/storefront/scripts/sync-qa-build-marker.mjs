/**
 * After a storefront production build, publish BUILD_ID to the LaunchAgent-
 * readable marker under ~/.woodright so run-storefront-qa.sh can reload
 * without reading Documents/ (TCC often blocks that for launchd).
 *
 * Also used by `yarn build` post-step and `yarn build:qa`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const storefrontRoot = join(import.meta.dirname, "..")
const buildIdPath = join(storefrontRoot, ".next-build", "BUILD_ID")
const port = process.env.WOODRIGHT_STOREFRONT_PORT || "3002"
const qaDir = process.env.WOODRIGHT_QA_DIR || join(process.env.HOME || "", ".woodright/qa-dev-servers")
const markerPath = join(qaDir, `storefront-${port}.build-id`)

if (!existsSync(buildIdPath)) {
  console.error("sync-qa-build-marker: missing", buildIdPath)
  process.exit(1)
}

const id = readFileSync(buildIdPath, "utf8").trim()
if (!id) {
  console.error("sync-qa-build-marker: empty BUILD_ID")
  process.exit(1)
}

mkdirSync(qaDir, { recursive: true })
writeFileSync(markerPath, `${id}\n`, "utf8")
console.log("sync-qa-build-marker: wrote", markerPath, "→", id)
