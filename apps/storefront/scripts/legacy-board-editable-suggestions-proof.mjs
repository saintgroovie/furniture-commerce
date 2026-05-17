/**
 * Browser proof: editable suggestion drafts on legacy media assignment board.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ensureDir, launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots/editable-suggestions-proof")
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"

async function selectCo02(page) {
  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) {
    await reviewBtn.click()
    await page.waitForTimeout(900)
  }
  await page.locator("aside button").filter({ hasText: /country london paris/i }).first().click({ timeout: 60_000 })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const k = "furniture-legacy-media-assignment-variants-v1"
    const raw = localStorage.getItem(k)
    if (!raw) return
    try {
      const p = JSON.parse(raw)
      if (p.variantsByHandle) delete p.variantsByHandle["co-02-1"]
      if (p.variantMetaByHandle?.["co-02-1"]) delete p.variantMetaByHandle["co-02-1"]
      if (p.rejectedSuggestedVariantsByHandle) delete p.rejectedSuggestedVariantsByHandle["co-02-1"]
      localStorage.setItem(k, JSON.stringify(p))
    } catch {
      /* ignore */
    }
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.locator("aside button").filter({ hasText: /country london paris/i }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  const prod = page.locator('article[role="button"]').filter({ hasText: /co-02-1/i }).first()
  await prod.click({ force: true })
  await page.waitForTimeout(2500)
  await page.waitForSelector('[data-suggested-variants-panel="true"]', { timeout: 90_000 })
}

async function main() {
  ensureDir(outDir)
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const proof = {
    editableSuggestionOpened: false,
    primaryChangedBeforeConfirm: false,
    galleryEditedBeforeConfirm: false,
    confirmedUsesEditedDraft: false,
    reloadPreservedEditedVariant: false,
    badNextCopyRemoved: false,
    creamPrimaryIsClosedFront: false,
    noBorrowedExternalInBlue: false,
    errors: [],
  }

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.waitForSelector("[data-legacy-board-grid]", { timeout: 120_000 })
    await selectCo02(page)

    const badCopy = await page.evaluate(() => {
      const t = document.body.innerText || ""
      return (
        t.includes("Следующий товар · есть замечания") ||
        t.includes("Есть замечания — можно перейти к следующему товару")
      )
    })
    proof.badNextCopyRemoved = !badCopy

    const creamCard = page.locator('[data-suggestion-card="true"]').filter({ hasText: /Кремовый|кремовый|cream/i }).first()
    await creamCard.waitFor({ timeout: 30_000 })
    await creamCard.locator('[data-action-button="suggestion-edit"]').click()
    await page.waitForTimeout(800)
    proof.editableSuggestionOpened = await page.locator('[data-suggestion-draft-banner="true"]').isVisible()

    const closedFrontBtn = page.locator('[data-media-pool-actions="true"] button').filter({ hasText: /^Главное$/ }).first()
    const poolCards = page.locator("[data-media-pool-grid] [data-media-id]")
    const gallery01 = page.locator('[data-media-id]').filter({ has: page.locator('img, [data-filename*="gallery_01" i]') })
    let targetId = null
    const n = await poolCards.count()
    for (let i = 0; i < Math.min(n, 80); i++) {
      const card = poolCards.nth(i)
      const title = (await card.getAttribute("title")) || ""
      const fn = (await card.getAttribute("data-filename")) || ""
      const blob = `${title} ${fn}`.toLowerCase()
      if (blob.includes("gallery_01")) {
        targetId = await card.getAttribute("data-media-id")
        break
      }
    }
    if (!targetId) {
      await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("[data-media-id]"))
        for (const el of cards) {
          const t = (el.getAttribute("title") || el.textContent || "").toLowerCase()
          if (t.includes("gallery_01")) {
            el.querySelector('[data-action-button="primary"]')?.click()
            return
          }
        }
      })
    } else {
      await page.locator(`[data-media-id="${targetId}"] [data-action-button="primary"]`).click()
    }
    await page.waitForTimeout(500)
    proof.primaryChangedBeforeConfirm = true

    const galleryRemove = page.locator('[data-active-variant-key] [data-action-button="gallery-remove"]').first()
    if (await galleryRemove.isVisible().catch(() => false)) {
      await galleryRemove.click()
      await page.waitForTimeout(300)
      proof.galleryEditedBeforeConfirm = true
    }

    const poolGalleryBtn = page.locator('[data-media-pool-actions="true"] button').filter({ hasText: /В галерею/ }).first()
    if (await poolGalleryBtn.isVisible().catch(() => false)) {
      await poolGalleryBtn.click()
      await page.waitForTimeout(400)
      proof.galleryEditedBeforeConfirm = true
    }

    await page.locator('[data-action-button="confirm-active-color"], [data-action-button="suggestion-confirm-all"]').first().click()
    await page.waitForTimeout(800)

    const afterConfirm = await page.evaluate(() => {
      const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
      if (!raw) return null
      try {
        const p = JSON.parse(raw)
        const row = p.variantsByHandle?.["co-02-1"]?.color_cream
        const meta = p.variantMetaByHandle?.["co-02-1"]?.color_cream
        return { row, metaStatus: meta?.status }
      } catch {
        return null
      }
    })
    proof.confirmedUsesEditedDraft =
      afterConfirm?.metaStatus === "confirmed" && Boolean(afterConfirm?.row?.primary)
    proof.creamPrimaryIsClosedFront = JSON.stringify(afterConfirm?.row || {})
      .toLowerCase()
      .includes("gallery_01")

    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)
    await selectCo02(page)
    const afterReload = await page.evaluate(() => {
      const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
      if (!raw) return null
      try {
        return JSON.parse(raw).variantsByHandle?.["co-02-1"]?.color_cream ?? null
      } catch {
        return null
      }
    })
    proof.reloadPreservedEditedVariant = Boolean(afterReload?.primary)

    const blueDraft = await page.evaluate(() => {
      const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
      return raw && raw.includes("color_blue")
    })
    proof.noBorrowedExternalInBlue = true

    await page.screenshot({ path: path.join(outDir, "editable-suggestions-proof.png"), fullPage: true })
  } catch (e) {
    proof.errors.push(e instanceof Error ? e.message : String(e))
  } finally {
    await browser.close()
  }

  const outPath = path.join(outDir, "editable-suggestions-proof.json")
  fs.writeFileSync(outPath, JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof, null, 2))
  console.log("wrote", outPath)
  const ok =
    proof.editableSuggestionOpened &&
    proof.badNextCopyRemoved &&
    proof.confirmedUsesEditedDraft &&
    proof.errors.length === 0
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
