/**
 * Capture Legacy Media Assignment Board screenshots (dev/QA only).
 * Requires: running storefront on LEGACY_BOARD_URL, system Chrome, playwright-core in NODE_PATH.
 * Output: LEGACY_BOARD_SCREENSHOT_DIR (default: <repo>/tmp/qa-screenshots) — do not commit PNGs.
 */

import path from "path"
import { fileURLToPath } from "url"
import {
  ensureDir,
  launchLegacyBoardBrowser,
  loadPlaywrightCore,
} from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir =
  process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots")
const baseUrl =
  process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"

async function main() {
  ensureDir(outDir)
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)

  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) {
    await reviewBtn.click().catch(() => {})
    await page.waitForTimeout(1500)
  }

  const co02 = page
    .locator('article[role="button"]:has-text("co-02-1"), button:has-text("co-02-1")')
    .first()
  if (await co02.isVisible().catch(() => false)) {
    await co02.click().catch(() => {})
    await page.waitForTimeout(2000)
  }

  await page.screenshot({
    path: path.join(outDir, "legacy-board-review-cockpit-1440.png"),
    fullPage: true,
  })

  const main = page.locator('[data-selected-product-main-media="true"]')
  if (await main.count()) {
    await main.screenshot({ path: path.join(outDir, "legacy-board-current-main-media-1440.png") })
  }

  const sug = page.locator('[data-suggestion-card="true"]').first()
  if (await sug.count()) {
    await sug.screenshot({ path: path.join(outDir, "legacy-board-suggestion-card-compact-1440.png") })
  }

  const pool = page.locator('[data-legacy-board-right-aside="true"]')
  if (await pool.count()) {
    await pool.screenshot({ path: path.join(outDir, "legacy-board-right-media-drawer-1440.png") })
  }

  await page.screenshot({
    path: path.join(outDir, "legacy-board-details-collapsed-1440.png"),
    fullPage: false,
  })

  const diag = page.locator('summary:has-text("Debug")').first()
  if (await diag.isVisible().catch(() => false)) {
    await diag.click()
    await page.waitForTimeout(400)
    if (await pool.count()) {
      await pool.screenshot({ path: path.join(outDir, "legacy-board-diagnostics-open-1440.png") })
    }
    const body = await page.locator("body").innerText().catch(() => "")
    console.log(
      JSON.stringify({ diagnostics_state_changed_yes: /State changed:\s*yes/i.test(body) })
    )
  }

  await browser.close()
  console.log("screenshots_written", outDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
