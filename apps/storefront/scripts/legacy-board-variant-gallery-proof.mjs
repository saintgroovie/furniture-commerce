/**
 * QA proof: visual-role dedupe + same-SKU borrow on suggestion cards (co-02-1).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ensureDir, launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/variant-gallery-proof")
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"
const apiBase = `${baseUrl}/api`

async function fetchJson(url) {
  const res = await fetch(url)
  return { status: res.status, data: await res.json() }
}

async function main() {
  ensureDir(outDir)
  const report = { handle: "co-02-1", http: {}, suggestions: [], note: "" }

  for (const ep of ["inventory", "candidates", "products", "enrich-color-article"]) {
    const { status } = await fetchJson(`${apiBase}/${ep}${ep === "enrich-color-article" ? "" : ""}`)
    report.http[ep] = status
  }

  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)

  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.waitForTimeout(800)

  const product = page.locator('article[role="button"]:has-text("co-02-1"), button:has-text("co-02-1")').first()
  if (await product.isVisible().catch(() => false)) await product.click().catch(() => {})
  await page.waitForTimeout(2500)

  const cards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-suggestion-card]")).map((el) => ({
      variantKey: el.getAttribute("data-variant-key"),
      label: el.querySelector("[data-variant-display-label]")?.textContent?.trim(),
      roleStrip: el.querySelector("[data-suggestion-role-strip]")?.textContent?.trim() || null,
      dedupeBadge: el.querySelector("[data-suggestion-dedupe-badge]")?.textContent?.trim() || null,
      borrowed: Boolean(el.querySelector("[data-suggestion-borrowed]")),
      thumbCount: el.querySelectorAll("[data-suggestion-thumbs] [data-suggestion-thumb]").length,
    }))
  })
  report.suggestions = cards

  const hasUserVariants = await page.evaluate(() => {
    const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
    if (!raw) return false
    try {
      const p = JSON.parse(raw)
      const row = p.variantsByHandle?.["co-02-1"] ?? p.variantsByHandle?.["CO-02-1"]
      return Boolean(row && Object.keys(row).some((k) => k !== "__default__"))
    } catch {
      return false
    }
  })
  report.hasUserVariantsInLs = hasUserVariants
  if (!hasUserVariants) {
    report.note =
      "Headless session has no user-edited variants (Молочный/Голубой) in localStorage — label/borrow proof limited to suggestion cards only."
  }

  await page.screenshot({ path: path.join(outDir, "co-02-1-suggestions.png"), fullPage: false })
  await browser.close()

  const outPath = path.join(outDir, "variant-gallery-proof.json")
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log("Wrote", outPath)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
