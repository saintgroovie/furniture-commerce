/**
 * Lightweight interaction smoke for Legacy Media Assignment Board (dev/QA only).
 * Read-only against the running Next dev server — no Medusa/DB/seed changes.
 */

import {
  launchLegacyBoardBrowser,
  loadPlaywrightCore,
} from "./legacy-board-playwright-utils.mjs"

const baseUrl =
  process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"

const log = (msg, extra = {}) => console.log(JSON.stringify({ step: msg, ...extra }))

async function main() {
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2000)

  const coCard = page.locator('article[data-product-card="true"]').filter({ hasText: /co-02-1/i }).first()
  if (await coCard.count()) {
    await coCard.click()
    log("selected_co_02_1")
  } else {
    await page.locator('button:has-text("co-02-1")').first().click({ timeout: 8000 }).catch(() => {})
    log("selected_co_02_1_fallback")
  }
  await page.waitForTimeout(2000)

  const mainMedia = page.locator('[data-selected-product-main-media="true"]')
  log("main_media_visible", { visible: await mainMedia.isVisible().catch(() => false) })

  const galleryMoveRight = page.locator('[data-action-button="gallery-move-right"]').first()
  if (await galleryMoveRight.isVisible().catch(() => false)) {
    await galleryMoveRight.click()
    log("gallery_move_right")
    await page.waitForTimeout(500)
  }

  const confirmVariant = page.locator('[data-action-button="suggestion-confirm-all"]').first()
  if (await confirmVariant.isVisible().catch(() => false)) {
    await confirmVariant.click()
    log("confirm_variant_clicked")
    await page.waitForTimeout(1000)
  } else {
    const confirmAll = page.locator('[data-action-button="suggestions-confirm-all-visible"]')
    if (await confirmAll.isVisible().catch(() => false)) {
      await confirmAll.click()
      log("confirm_all_visible_clicked")
      await page.waitForTimeout(1000)
    }
  }

  const nextBtn = page.locator('[data-review-cockpit="true"] button:has-text("Next")').first()
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click()
    log("next_product")
    await page.waitForTimeout(1500)
  }

  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  log("reload_ok", { url: page.url() })

  const diagSummary = page.locator('summary:has-text("Debug")').first()
  if (await diagSummary.isVisible().catch(() => false)) {
    await diagSummary.click()
    await page.waitForTimeout(300)
    const body = await page.locator('[data-legacy-board-right-aside="true"]').innerText().catch(() => "")
    log("diagnostics_after_actions", {
      state_changed: /state.*changed.*yes/i.test(body) || /State changed:\s*yes/i.test(body),
    })
  }

  await browser.close()
  log("done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
