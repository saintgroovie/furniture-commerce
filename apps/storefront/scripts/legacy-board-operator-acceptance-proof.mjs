/**
 * Operator acceptance pass: 3 products × full lane flow (no screenshots committed).
 * Products: co-02-1 (baseline), co-65-1 (multi-color CLP), ol-05-н (sparse media).
 */

import path from "path"
import { fileURLToPath } from "url"
import { launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.LEGACY_BOARD_URL || "http://127.0.0.1:8000/qa/legacy-media-assignment-board"

const PRODUCTS = [
  { handle: "co-02-1", label: "baseline", collectionFilter: /country london paris/i },
  { handle: "co-65-1", label: "multi_color", collectionFilter: /country london paris/i },
  { handle: "ol-05-н", label: "sparse_media", collectionFilter: /oliver/i },
]

const LS_VARIANTS = "furniture-legacy-media-assignment-variants-v1"
const LS_DECISIONS = "furniture-legacy-media-assignment-decisions-v1"

function log(msg, extra = {}) {
  console.log(JSON.stringify({ msg, ...extra }))
}

async function clearHandleState(page, handle) {
  await page.evaluate(
    ({ handle, k1, k2 }) => {
      for (const k of [k1, k2]) {
        const raw = localStorage.getItem(k)
        if (!raw) continue
        try {
          const p = JSON.parse(raw)
          if (p.variantsByHandle) delete p.variantsByHandle[handle]
          if (p.rejectedSuggestedVariantsByHandle) delete p.rejectedSuggestedVariantsByHandle[handle]
          if (p.zonesByHandle) delete p.zonesByHandle[handle]
          if (p.activeVariantByHandle) delete p.activeVariantByHandle[handle]
          localStorage.setItem(k, JSON.stringify(p))
        } catch {
          /* ignore */
        }
      }
    },
    { handle, k1: LS_VARIANTS, k2: LS_DECISIONS }
  )
}

async function enterReviewAndSelect(page, product) {
  const reviewBtn = page.getByRole("button", { name: /^Review$/i }).first()
  if (await reviewBtn.isVisible().catch(() => false)) {
    await reviewBtn.click()
    await page.waitForTimeout(700)
  }
  if (product.collectionFilter) {
    await page.locator("aside button").filter({ hasText: product.collectionFilter }).first().click({ timeout: 45_000 })
    await page.waitForTimeout(350)
  }
  const searchInput = page.locator('input[placeholder*="SKU"], input[placeholder*="handle"]').first()
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(product.handle)
    await page.waitForTimeout(500)
  }
  const details = page.locator("summary").filter({ hasText: /Products in this view|товар/i }).first()
  if (await details.isVisible().catch(() => false)) {
    await details.click().catch(() => {})
    await page.waitForTimeout(300)
  }
  const card = page.locator('article[role="button"]').filter({ hasText: new RegExp(product.handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first()
  if (!(await card.count())) throw new Error(`product_card_not_found:${product.handle}`)
  await card.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" })
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(2200)
  await page.waitForSelector('[data-suggested-variants-panel="true"]', { timeout: 90_000 })
}

async function readUxSignals(page) {
  return page.evaluate(() => ({
    activeBanner: Boolean(document.querySelector('[data-active-color-banner="true"]')),
    activeChip: Boolean(document.querySelector('[data-active-color-chip="true"]')),
    skuProgress: Boolean(document.querySelector('[data-sku-progress="true"]')),
    progressText: document.querySelector('[data-sku-progress="true"]')?.textContent?.trim()?.slice(0, 120) ?? null,
    stickyHeader: Boolean(document.querySelector('[data-product-sticky-header="true"]')),
    poolGrid: Boolean(document.querySelector("[data-media-pool-grid]")),
    addToAllBtn: Boolean(document.querySelector('[data-action-button="add-to-all-galleries"]')),
    hiddenDupHints: [...document.querySelectorAll("[data-suggestion-card], [data-suggested-variants-panel] *")]
      .map((el) => el.textContent || "")
      .filter((t) => /похожих скрыто/i.test(t)).length,
    actionButtonsOnFirstPoolCard: (() => {
      const card = document.querySelector("[data-media-pool-grid] [data-pool-card], [data-media-pool-grid] article")
      return card ? card.querySelectorAll("[data-action-button]").length : 0
    })(),
  }))
}

async function readVariantState(page, handle) {
  return page.evaluate(
    ({ handle, lsKey }) => {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return null
      const p = JSON.parse(raw)
      const variants = p.variantsByHandle?.[handle] ?? {}
      const active = p.activeVariantByHandle?.[handle] ?? null
      const colors = {}
      for (const [vk, vv] of Object.entries(variants)) {
        if (!vk.startsWith("color_") || vk.includes("needs_review")) continue
        colors[vk] = { primary: vv.primary, gallery: [...(vv.gallery ?? [])] }
      }
      return { active, colors, colorCount: Object.keys(colors).length }
    },
    { handle, lsKey: LS_VARIANTS }
  )
}

async function runProductFlow(page, product) {
  const handle = product.handle
  const report = { handle, label: product.label, steps: [], ux: {}, errors: [] }

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForSelector("[data-legacy-board-grid]", { timeout: 120_000 })
  await clearHandleState(page, handle)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)

  await enterReviewAndSelect(page, product)
  report.ux.before = await readUxSignals(page)

  const confirmAll = page.locator('[data-action-button="suggestions-confirm-all-visible"]').first()
  if (await confirmAll.isVisible().catch(() => false) && (await confirmAll.isEnabled().catch(() => false))) {
    await confirmAll.click()
    await page.waitForTimeout(1200)
    report.steps.push("confirm_all_visible")
  } else if (await confirmAll.isVisible().catch(() => false)) {
    report.steps.push("confirm_all_skipped_disabled")
  } else {
    const perConfirm = page.locator('[data-action-button="suggestion-confirm-all"]')
    const n = await perConfirm.count()
    if (n > 0) {
      await perConfirm.first().click()
      await page.waitForTimeout(900)
      report.steps.push("confirm_first_variant")
    }
  }

  const chips = page.locator('[data-variant-chip="true"]')
  const chipCount = await chips.count()
  if (chipCount > 0) {
    await chips.nth(0).click()
    await page.waitForTimeout(500)
    report.steps.push("select_color_chip_0")
  }

  const setPrimary = page.locator('[data-action-button="set-primary"]').first()
  if (await setPrimary.isVisible().catch(() => false)) {
    await setPrimary.click()
    await page.waitForTimeout(500)
    report.steps.push("set_primary")
  }

  const moveRight = page.locator('[data-action-button="gallery-move-right"]').first()
  if (await moveRight.isVisible().catch(() => false)) {
    await moveRight.click()
    await page.waitForTimeout(400)
    report.steps.push("gallery_move_right")
  }

  const addGallery = page.locator('[data-action-button="add-to-gallery"]').first()
  if (await addGallery.isEnabled().catch(() => false)) {
    await addGallery.click()
    await page.waitForTimeout(600)
    report.steps.push("add_to_gallery_single")
  }

  const addAll = page.locator('[data-action-button="add-to-all-galleries"]').first()
  const mediaId = await addAll.getAttribute("data-media-id")
  if (mediaId && (await addAll.isEnabled().catch(() => false))) {
    await addAll.click()
    await page.waitForTimeout(700)
    report.steps.push("add_to_all_colors")
    report.mediaId = mediaId
  }

  const stateAfterBulk = await readVariantState(page, handle)
  report.stateAfterBulk = stateAfterBulk

  if (mediaId && stateAfterBulk?.colors) {
    const withMedia = Object.entries(stateAfterBulk.colors).filter(([, v]) => v.gallery.includes(mediaId))
    if (withMedia.length < 2 && product.label !== "sparse_media") {
      report.errors.push(`bulk_append_expected_2plus_colors got ${withMedia.length}`)
    }
  }

  const removeBtn = page.locator('[data-action-button="gallery-remove"]').first()
  if (await removeBtn.isVisible().catch(() => false)) {
    await removeBtn.click()
    await page.waitForTimeout(500)
    report.steps.push("gallery_remove_active_color")
  }

  const stateAfterRemove = await readVariantState(page, handle)
  report.stateAfterRemove = stateAfterRemove

  if (mediaId && stateAfterRemove?.colors) {
    const stillInOthers = Object.entries(stateAfterRemove.colors).filter(
      ([vk, v]) => vk !== stateAfterRemove.active && v.gallery.includes(mediaId)
    )
    report.otherColorsStillHaveMedia = stillInOthers.map(([k]) => k)
    if (stillInOthers.length === 0 && Object.keys(stateAfterRemove.colors).length > 1) {
      report.errors.push("remove_from_active_removed_from_all_colors")
    }
  }

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  const copyBtn = page.getByRole("button", { name: /копировать json|copy json/i }).first()
  if (await copyBtn.isVisible().catch(() => false)) {
    await copyBtn.click()
    await page.waitForTimeout(400)
    try {
      const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
      const vdRoot = exported.variant_decisions ?? {}
      const vd =
        vdRoot[handle] ??
        vdRoot[handle.toLowerCase()] ??
        Object.entries(vdRoot).find(([k]) => k.toLowerCase() === handle.toLowerCase())?.[1]
      const flat = (exported.legacy_assignments_v1_flat ?? []).filter(
        (r) => String(r.target_handle).toLowerCase() === handle.toLowerCase()
      )
      report.export = {
        hasVariantDecisions: Boolean(vd),
        colorKeys: vd ? Object.keys(vd).filter((k) => k.startsWith("color_")).length : 0,
        flatRows: flat.length,
        canonical: exported.review_meta?.canonical_per_variant_state ?? null,
        activeInExport:
          exported.active_variant_by_handle?.[handle] ??
          exported.active_variant_by_handle?.[handle.toLowerCase()] ??
          exported.products?.find((p) => String(p.handle).toLowerCase() === handle.toLowerCase())?.active_variant_key,
      }
      if (!vd && product.label !== "sparse_media") report.errors.push("export_missing_variant_decisions")
      if (!vd && product.label === "sparse_media" && !exported.products?.length) {
        report.errors.push("export_missing_products_row")
      }
    } catch (e) {
      report.errors.push(`export_clipboard_failed:${e.message}`)
    }
  }

  const preReload = await readVariantState(page, handle)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  await page.waitForSelector("[data-legacy-board-grid]", { timeout: 60_000 })
  await enterReviewAndSelect(page, product)
  await page.waitForTimeout(1200)
  const postReload = await readVariantState(page, handle)
  report.reload = { preColorCount: preReload?.colorCount, postColorCount: postReload?.colorCount, activeKept: preReload?.active === postReload?.active }

  if (preReload?.colorCount && postReload?.colorCount && postReload.colorCount < preReload.colorCount) {
    report.errors.push("reload_lost_color_variants")
  }

  report.ux.after = await readUxSignals(page)
  return report
}

async function main() {
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const page = await context.newPage()

  const results = []
  for (const product of PRODUCTS) {
    log("product_start", { handle: product.handle, label: product.label })
    try {
      const r = await runProductFlow(page, product)
      results.push(r)
      log("product_done", { handle: product.handle, errors: r.errors, steps: r.steps })
    } catch (e) {
      results.push({ handle: product.handle, label: product.label, errors: [String(e.message || e)] })
      log("product_fail", { handle: product.handle, error: String(e) })
    }
  }

  await browser.close()

  const failed = results.filter((r) => (r.errors ?? []).length > 0)
  console.log("\n=== ACCEPTANCE SUMMARY ===")
  console.log(JSON.stringify({ products: results.map((r) => ({ handle: r.handle, label: r.label, errors: r.errors, steps: r.steps, export: r.export, ux: r.ux })) }, null, 2))
  if (failed.length) {
    console.error("acceptance_failed", failed.map((f) => f.handle))
    process.exit(1)
  }
  console.log("acceptance_ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
