/**
 * QA proof: visual-role classification + co-02-1 suggestions (headless).
 * Writes tmp/qa-screenshots/visual-role-proof/visual-role-proof.json + PNGs.
 */

import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ensureDir, launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/visual-role-proof")
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"
const apiBase = `${baseUrl}/api`

async function fetchJson(url) {
  const res = await fetch(url)
  return { status: res.status, data: await res.json() }
}

function runCo02HeadlessProof() {
  const out = execSync("npx tsx scripts/legacy-board-co02-engine-proof.ts", {
    cwd: path.join(repoRoot, "apps/storefront"),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  return JSON.parse(out.trim())
}

async function main() {
  ensureDir(outDir)
  const report = {
    handle: "co-02-1",
    http: {},
    headlessEngine: null,
    browser: { suggestions: [], activeVariant: null, afterRecommendedOrder: null },
    note: "",
  }

  for (const ep of ["inventory", "candidates", "products", "enrich-color-article"]) {
    const { status } = await fetchJson(`${apiBase}/${ep}`)
    report.http[ep] = status
  }

  report.headlessEngine = await runCo02HeadlessProof()

  const cream = report.headlessEngine.variants["Кремовый"]
  if (cream?.primaryIsInterior) {
    report.validationError = "Кремовый primary must not be interior"
  } else if (cream?.primary?.role && !["hero_front", "front_anfas"].includes(cream.primary.role)) {
    report.validationError = `Кремовый primary role unexpected: ${cream.primary.role}`
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
  await page.waitForTimeout(2000)

  report.browser.suggestions = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-suggestion-card]")).map((el) => ({
      variantKey: el.getAttribute("data-variant-key"),
      label: el.querySelector("[data-variant-display-label]")?.textContent?.trim(),
      roleStrip: el.querySelector("[data-suggestion-role-strip]")?.textContent?.trim() || null,
      dedupeBadge: el.querySelector("[data-suggestion-dedupe-badge]")?.textContent?.trim() || null,
      borrowed: Boolean(el.querySelector("[data-suggestion-borrowed]")),
      thumbCount: el.querySelectorAll("[data-suggestion-thumbs] [data-suggestion-thumb]").length,
    }))
  )

  await page.screenshot({ path: path.join(outDir, "co-02-1-suggestions-before.png"), fullPage: false })

  const creamCard = page.locator('[data-suggestion-card][data-variant-key="color_cream"]').first()
  if (await creamCard.isVisible().catch(() => false)) {
    await creamCard.scrollIntoViewIfNeeded().catch(() => {})
    await page.screenshot({ path: path.join(outDir, "co-02-1-cream-suggestion.png") })
  }

  const confirmCream = page.locator('[data-suggestion-card][data-variant-key="color_cream"] button', { hasText: /Подтвердить|Confirm/i }).first()
  if (await confirmCream.isVisible().catch(() => false)) {
    await confirmCream.click().catch(() => {})
    await page.waitForTimeout(1200)
  }

  const orderBtn = page.getByRole("button", { name: /Упорядочить по типам фото/i }).first()
  if (await orderBtn.isVisible().catch(() => false)) {
    await orderBtn.click()
    await page.waitForTimeout(800)
    report.browser.afterRecommendedOrder = await page.evaluate(() => {
      const primary = document.querySelector("[data-variant-primary-slot] [data-media-id]")?.getAttribute("data-media-id")
      const gallery = Array.from(document.querySelectorAll("[data-variant-gallery-strip] [data-media-id]")).map((el) =>
        el.getAttribute("data-media-id")
      )
      return { primary, gallery }
    })
    await page.screenshot({ path: path.join(outDir, "co-02-1-after-recommended-order.png") })
  }

  const hasUserVariants = await page.evaluate(() => {
    const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
    if (!raw) return false
    try {
      const p = JSON.parse(raw)
      const row = p.variantsByHandle?.["co-02-1"] ?? p.variantsByHandle?.["CO-02-1"]
      return Boolean(row && Object.keys(row).some((k) => k !== "__default__" && /молоч|голуб/i.test(JSON.stringify(row[k]))))
    } catch {
      return false
    }
  })
  if (hasUserVariants) {
    report.note =
      "Browser LS contains user-edited variant labels (Молочный/Голубой) — verify rename persistence manually after reload."
  } else {
    report.note =
      "Headless uses token labels (Кремовый/Синий/…). User-edited Молочный/Голубой exist only in real browser LS — not asserted here."
  }

  const outJson = path.join(outDir, "visual-role-proof.json")
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: !report.validationError, outJson, outDir, validationError: report.validationError }))
  await browser.close()
  if (report.validationError) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
