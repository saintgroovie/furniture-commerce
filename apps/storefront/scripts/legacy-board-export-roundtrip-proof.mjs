/**
 * Proof: export JSON includes per-variant galleries after «Во все цвета»; reload keeps LS state.
 */

import path from "path"
import { fileURLToPath } from "url"
import { ensureDir, launchLegacyBoardBrowser, loadPlaywrightCore } from "./legacy-board-playwright-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const outDir = process.env.LEGACY_BOARD_SCREENSHOT_DIR || path.join(repoRoot, "tmp/qa-screenshots")
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
    const keys = [
      "furniture-legacy-media-assignment-variants-v1",
      "furniture-legacy-media-assignment-decisions-v1",
    ]
    for (const k of keys) {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      try {
        const p = JSON.parse(raw)
        if (p.variantsByHandle) delete p.variantsByHandle["co-02-1"]
        if (p.rejectedSuggestedVariantsByHandle) delete p.rejectedSuggestedVariantsByHandle["co-02-1"]
        if (p.zonesByHandle) delete p.zonesByHandle["co-02-1"]
        localStorage.setItem(k, JSON.stringify(p))
      } catch {
        /* ignore */
      }
    }
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  if (await reviewBtn.isVisible().catch(() => false)) await reviewBtn.click().catch(() => {})
  await page.locator("aside button").filter({ hasText: /country london paris/i }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  await page.locator('article[role="button"]').filter({ hasText: /co-02-1/i }).first().click({ force: true })
  await page.waitForTimeout(2500)
  await page.waitForSelector('[data-suggested-variants-panel="true"]', { timeout: 90_000 })
}

async function main() {
  ensureDir(outDir)
  const playwright = await loadPlaywrightCore()
  const browser = await launchLegacyBoardBrowser(playwright)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForSelector("[data-legacy-board-grid]", { timeout: 120_000 })

  await selectCo02(page)

  const addBtn = page.locator('[data-action-button="add-to-all-galleries"]').first()
  const mediaId = await addBtn.getAttribute("data-media-id")
  if (!mediaId) throw new Error("missing data-media-id on add-to-all button")
  await addBtn.click()
  await page.waitForTimeout(800)

  const copyBtn = page.getByRole("button", { name: /копировать json|copy json/i }).first()
  await copyBtn.click()
  await page.waitForTimeout(400)

  const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
  const handle = "co-02-1"
  const vd = exported.variant_decisions?.[handle]
  if (!vd) throw new Error("export missing variant_decisions.co-02-1")

  const colorKeys = Object.keys(vd).filter((k) => k.startsWith("color_") && !k.includes("needs_review"))
  const withMedia = colorKeys.filter((k) => vd[k].gallery?.includes(mediaId))
  console.log("export_color_keys", colorKeys.length, "with_media", withMedia.length, "mediaId", mediaId)

  if (withMedia.length < 2) {
    throw new Error(`expected media in multiple color galleries, got ${withMedia.length}: ${withMedia.join(",")}`)
  }

  const flat = exported.legacy_assignments_v1_flat ?? []
  const flatColorRows = flat.filter((r) => r.variant_key?.startsWith("color_") && r.inventory_id === mediaId)
  console.log("flat_variant_rows_for_media", flatColorRows.length)
  if (flatColorRows.length < 2) {
    throw new Error(`legacy_assignments_v1_flat missing per-color rows (${flatColorRows.length})`)
  }

  const meta = exported.review_meta ?? {}
  if (meta.canonical_per_variant_state !== "variant_decisions") {
    throw new Error("review_meta.canonical_per_variant_state missing or wrong")
  }

  const co02Product = (exported.products ?? []).find((p) => String(p.handle).toLowerCase() === handle)
  if (!co02Product?.active_variant_key) {
    console.log("warn: products[].active_variant_key not set", co02Product?.active_variant_key)
  }

  const activeVk = exported.active_variant_by_handle?.[handle]
  const activeGallery = vd[activeVk]?.gallery ?? []
  const productsGallery = co02Product?.gallery_candidates ?? []
  const zonesMatch =
    productsGallery.length === activeGallery.length &&
    productsGallery.every((id, i) => id === activeGallery[i])
  console.log("active_variant", activeVk, "products_mirror_active", zonesMatch)
  if (!zonesMatch) throw new Error("products[].gallery_candidates does not mirror active variant_decisions gallery")

  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  await page.locator('article[role="button"]').filter({ hasText: /co-02-1/i }).first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)

  const afterReload = await page.evaluate((mid) => {
    const raw = localStorage.getItem("furniture-legacy-media-assignment-variants-v1")
    const p = JSON.parse(raw)
    const variants = p.variantsByHandle?.["co-02-1"] ?? {}
    const counts = {}
    for (const [vk, vv] of Object.entries(variants)) {
      if (!vk.startsWith("color_")) continue
      counts[vk] = vv.gallery?.includes(mid) ?? false
    }
    return { counts, active: p.activeVariantByHandle?.["co-02-1"] }
  }, mediaId)
  console.log("reload_ls", JSON.stringify(afterReload))

  const reloadColorsWith = Object.values(afterReload.counts).filter(Boolean).length
  if (reloadColorsWith < 2) throw new Error("reload lost bulk-append galleries")

  await page.screenshot({ path: path.join(outDir, "export-roundtrip-after-reload-1440.png") })
  await browser.close()
  console.log("proof_ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
