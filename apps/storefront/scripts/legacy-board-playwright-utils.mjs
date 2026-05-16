/**
 * Dev-only helpers for Legacy Media Assignment Board browser scripts.
 * Does not add playwright-core to the storefront package — install it in a temp dir (see PW_INSTALL_HINT).
 */

import fs from "fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PW_INSTALL_HINT = `playwright-core is not available.

Install it in a temporary folder (not in this repo):

  mkdir -p /tmp/legacy-board-shot && cd /tmp/legacy-board-shot
  npm init -y && npm install playwright-core@1.51.0

Then run with PLAYWRIGHT_CORE_NODE_MODULES pointing at that install:

  export PLAYWRIGHT_CORE_NODE_MODULES=/tmp/legacy-board-shot/node_modules
  node /path/to/furniture-commerce/apps/storefront/scripts/legacy-board-screenshot.mjs
`

/** @returns {Promise<typeof import('playwright-core')>} */
export async function loadPlaywrightCore() {
  const nodeModuleRoots = []
  if (process.env.PLAYWRIGHT_CORE_NODE_MODULES) {
    nodeModuleRoots.push(process.env.PLAYWRIGHT_CORE_NODE_MODULES)
  }
  nodeModuleRoots.push(path.join(process.cwd(), "node_modules"))
  nodeModuleRoots.push("/tmp/legacy-board-shot/node_modules")

  for (const root of nodeModuleRoots) {
    try {
      const req = createRequire(path.join(root, "package.json"))
      const resolved = req.resolve("playwright-core")
      const mod = await import(pathToFileURL(resolved).href)
      const pw = normalizePlaywrightModule(mod)
      if (pw?.chromium) return pw
    } catch {
      // try next root
    }
  }

  try {
    const mod = await import("playwright-core")
    const pw = normalizePlaywrightModule(mod)
    if (pw?.chromium) return pw
    throw new Error("playwright-core loaded but chromium API missing")
  } catch (e) {
    console.error(PW_INSTALL_HINT)
    if (e instanceof Error && e.message) console.error(e.message)
    process.exit(1)
  }
}

/** System Chrome/Chromium path; override with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or CHROME_PATH. */
export function resolveChromeExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  }
  if (process.platform === "linux") {
    return "/usr/bin/google-chrome"
  }
  return "chrome"
}

function normalizePlaywrightModule(mod) {
  if (!mod) return null
  if (mod.chromium) return mod
  if (mod.default?.chromium) return mod.default
  return null
}

export async function launchLegacyBoardBrowser(playwright) {
  const executablePath = resolveChromeExecutablePath()
  if (!fs.existsSync(executablePath)) {
    console.error(
      `Chrome executable not found at: ${executablePath}\nSet PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or CHROME_PATH.`
    )
    process.exit(1)
  }
  return playwright.chromium.launch({ executablePath, headless: true })
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}
