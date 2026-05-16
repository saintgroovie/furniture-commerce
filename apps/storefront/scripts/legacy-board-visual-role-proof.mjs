/**
 * QA proof: visual-role classification + recommended order on legacy media board.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import {
  ensureDir,
  launchLegacyBoardBrowser,
  loadPlaywrightCore,
} from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/visual-role-proof")
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"
const apiBase = `${baseUrl}/api`

async function fetchJson(url) {
  const res = await fetch(url)
  const data = await res.json()
  return { status: res.status, data }
}

async function main() {
  ensureDir(outDir)
  const report = { handle: "co-02-1", variants: {}, http: {}, note: "" }

  for (const ep of ["inventory", "candidates", "products"]) {
    const { status } = await fetchJson(`${apiBase}/${ep}`)
    report.http[ep] = status
  }

  const inv = (await fetchJson(`${apiBase}/inventory`)).data
  const items = (inv.items || []).filter((it) => /co-02-1|co_02_1/i.test(`${it.filename} ${it.sku_hint} ${it.handle_hint}`))
  report.inventory_co02_sample = items.slice(0, 12).map((it) => ({
    id: it.id,
    filename: it.filename,
    source_path: it.source_path,
  }))

  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)

  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.waitForTimeout(1000)

  const product = page.locator('article[role="button"]:has-text("co-02-1"), button:has-text("co-02-1")').first()
  if (await product.isVisible().catch(() => false)) await product.click().catch(() => {})
  await page.waitForTimeout(2000)

  const lsBefore = await page.evaluate(() => localStorage.getItem("furniture-legacy-media-assignment-variants-v1"))

  for (const label of ["Молочный", "Голубой"]) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first()
    if (!(await btn.isVisible().catch(() => false))) {
      report.variants[label] = { error: "variant chip not in headless session" }
      continue
    }
    await btn.click()
    await page.waitForTimeout(800)
    const dom = await page.evaluate(() => {
      const primary = document.querySelector("[data-variant-primary-slot] [data-media-id]")?.getAttribute("data-media-id")
      const gallery = Array.from(document.querySelectorAll("[data-variant-gallery-strip] [data-media-id]")).map((el) =>
        el.getAttribute("data-media-id")
      )
      const badges = Array.from(document.querySelectorAll("[data-variant-gallery-strip] [data-media-card] span[title]")).map(
        (el) => el.textContent?.trim()
      )
      return { primary, gallery, badgeSample: badges.slice(0, 8) }
    })
    report.variants[label] = dom
    await page.screenshot({ path: path.join(outDir, `co-02-1-${label.replace(/\s+/g, "-")}.png`) })
  }

  const orderBtn = page.getByRole("button", { name: /Упорядочить по типам фото/i }).first()
  if (await orderBtn.isVisible().catch(() => false)) {
    await orderBtn.click()
    await page.waitForTimeout(600)
    report.afterRecommendedOrder = await page.evaluate(() => {
      const primary = document.querySelector("[data-variant-primary-slot] [data-media-id]")?.getAttribute("data-media-id")
      const gallery = Array.from(document.querySelectorAll("[data-variant-gallery-strip] [data-media-id]")).map((el) =>
        el.getAttribute("data-media-id")
      )
      return { primary, gallery }
    })
    await page.screenshot({ path: path.join(outDir, "co-02-1-after-recommended-order.png") })
  } else {
    report.afterRecommendedOrder = { error: "order button not visible" }
  }

  const lsAfter = await page.evaluate(() => localStorage.getItem("furniture-legacy-media-assignment-variants-v1"))
  report.localStorage_before = lsBefore
  report.localStorage_after = lsAfter

  if (!report.variants["Молочный"]?.primary && !report.variants["Голубой"]?.primary) {
    report.note =
      "Headless session had no Молочный/Голубой chips — verify visual roles in your browser on co-02-1 after setting variants."
    const def = await page.evaluate(() => {
      const primary = document.querySelector("[data-variant-primary-slot] [data-media-id]")?.getAttribute("data-media-id")
      const gallery = Array.from(document.querySelectorAll("[data-variant-gallery-strip] [data-media-id]")).map((el) =>
        el.getAttribute("data-media-id")
      )
      return { primary, gallery }
    })
    report.default_variant = def
    await page.screenshot({ path: path.join(outDir, "co-02-1-default-variant.png") })
  }

  const outJson = path.join(outDir, "visual-role-proof.json")
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: true, outJson, outDir }))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
