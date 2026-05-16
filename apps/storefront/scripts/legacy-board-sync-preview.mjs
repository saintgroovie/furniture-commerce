/**
 * QA proof: board rules sync preview (co-02-1 + Oxford/Monchelsea sample).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ensureDir, launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/legacy-board-sync")
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"
const apiBase = `${baseUrl}/api`

async function fetchJson(url) {
  const res = await fetch(url)
  return { status: res.status, data: await res.json() }
}

async function main() {
  ensureDir(outDir)
  const report = { http: {}, ui: {}, note: "" }

  for (const ep of ["inventory", "candidates", "products", "enrich-color-article"]) {
    report.http[ep] = (await fetchJson(`${apiBase}/${ep}`)).status
  }

  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)

  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.waitForTimeout(800)

  for (const handle of ["co-02-1", "oxford-co-02-1"]) {
    const product = page.locator(`article[role="button"]:has-text("${handle}"), button:has-text("${handle}")`).first()
    if (await product.isVisible().catch(() => false)) await product.click().catch(() => {})
    await page.waitForTimeout(1500)
  }

  const syncBtn = page.locator('[data-action-button="board-sync-preview"]').first()
  if (await syncBtn.isVisible().catch(() => false)) {
    await syncBtn.click()
    await page.waitForTimeout(1200)
  }

  report.ui = await page.evaluate(() => {
    const panel = document.querySelector("[data-board-sync-panel]")
    const counts = panel?.textContent?.slice(0, 400) ?? null
    const variants = Array.from(document.querySelectorAll("[data-sync-variant-key]")).map((el) => ({
      key: el.getAttribute("data-sync-variant-key"),
      summary: el.querySelector("summary")?.textContent?.trim(),
    }))
    const hasUserLs = (() => {
      try {
        const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
        if (!raw) return false
        const p = JSON.parse(raw)
        const row = p.variantsByHandle?.["co-02-1"]
        return Boolean(row && Object.keys(row).some((k) => k !== "__default__" && row[k]?.labelEditedByUser))
      } catch {
        return false
      }
    })()
    return { syncPanelVisible: Boolean(panel), countsSnippet: counts, variantDiffs: variants, hasUserEditedLabelsInLs: hasUserLs }
  })

  if (!report.ui.hasUserEditedLabelsInLs) {
    report.note =
      "Headless has no user-edited variant labels (e.g. Молочный) in localStorage. Open the board in your browser and run «Синхронизировать по правилам» to verify label preservation."
  }

  await page.screenshot({ path: path.join(outDir, "sync-panel.png"), fullPage: false })
  await browser.close()

  const outPath = path.join(outDir, "legacy-board-sync-preview.json")
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log("Wrote", outPath)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
