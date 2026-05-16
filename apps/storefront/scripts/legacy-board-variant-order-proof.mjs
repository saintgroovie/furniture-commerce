/**
 * QA proof: variant gallery order persistence + thumbnails (co-02-1 Молочный / Голубой).
 * Requires storefront on LEGACY_BOARD_URL and playwright-core.
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
const outDir =
  process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/variant-order-proof")
const baseUrl =
  process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"
const HANDLE = (process.env.LEGACY_BOARD_HANDLE || "co-02-1").toLowerCase()

async function domGalleryOrder(page) {
  return page.evaluate(() => {
    const primary = document.querySelector("[data-variant-primary-slot] [data-media-id]")?.getAttribute("data-media-id")
    const gallery = Array.from(
      document.querySelectorAll("[data-variant-gallery-strip] [data-media-id]")
    ).map((el) => el.getAttribute("data-media-id"))
    return { primary, gallery }
  })
}

async function clickVariantByLabel(page, label) {
  const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(800)
    return true
  }
  return false
}

async function main() {
  ensureDir(outDir)
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(3000)

  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.waitForTimeout(1200)

  const product = page
    .locator(`article[role="button"]:has-text("${HANDLE}"), button:has-text("${HANDLE}")`)
    .first()
  if (await product.isVisible().catch(() => false)) await product.click().catch(() => {})
  await page.waitForTimeout(2500)

  const lsBefore = await page.evaluate(() => ({
    board: localStorage.getItem("furniture-legacy-media-assignment-decisions-v1"),
    variants: localStorage.getItem("furniture-legacy-media-assignment-variants-v1"),
  }))

  const report = {
    handle: HANDLE,
    url: baseUrl,
    variants: {},
    localStorage_before_reload: null,
    localStorage_after_reload: null,
    export_after_reload: null,
  }

  for (const label of ["Молочный", "Голубой"]) {
    const ok = await clickVariantByLabel(page, label)
    if (!ok) {
      report.variants[label] = { error: "variant button not found" }
      continue
    }
    const dom = await domGalleryOrder(page)
    const thumbs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-suggestion-thumbs] [data-media-id]")).map((el) => ({
        id: el.getAttribute("data-media-id"),
        role: el.getAttribute("data-suggestion-thumb"),
        hasImg: Boolean(el.querySelector("img")),
      }))
    )
    await page.screenshot({
      path: path.join(outDir, `variant-${label.replace(/\s+/g, "-")}.png`),
      fullPage: false,
    })
    report.variants[label] = { dom, suggestionThumbs: thumbs }
  }

  report.localStorage_before_reload = lsBefore

  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(3500)
  if (await product.isVisible().catch(() => false)) await product.click().catch(() => {})
  await page.waitForTimeout(2000)

  const lsAfter = await page.evaluate(() => ({
    board: localStorage.getItem("furniture-legacy-media-assignment-decisions-v1"),
    variants: localStorage.getItem("furniture-legacy-media-assignment-variants-v1"),
  }))
  report.localStorage_after_reload = lsAfter

  for (const label of ["Молочный", "Голубой"]) {
    await clickVariantByLabel(page, label)
    const dom = await domGalleryOrder(page)
    report.variants[`${label}_after_reload`] = dom
  }

  await clickVariantByLabel(page, "Молочный")
  await clickVariantByLabel(page, "Голубой")
  await clickVariantByLabel(page, "Молочный")
  report.variants.switch_roundtrip_moloch = await domGalleryOrder(page)

  const exportBtn = page.getByRole("button", { name: /Copy|Download|export/i }).first()
  if (await exportBtn.isVisible().catch(() => false)) {
    await exportBtn.click().catch(() => {})
    await page.waitForTimeout(500)
  }

  const exportJson = await page.evaluate(() => {
    const el = document.querySelector("[data-export-json-preview]")
    return el?.textContent?.trim() || null
  })
  report.export_after_reload = exportJson ? JSON.parse(exportJson.slice(0, 500_000)) : null

  const outJson = path.join(outDir, "variant-order-proof.json")
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: true, outDir, outJson, variantKeys: Object.keys(report.variants) }))

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
