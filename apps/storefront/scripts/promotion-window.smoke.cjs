#!/usr/bin/env node
/**
 * Promotion Window browser smoke: catalog placement per breakpoint, rotation,
 * pause on hover / focus, prefers-reduced-motion, promo → PDP → cart economics
 * for every rotating product, plus visual evidence screenshots.
 *
 *   WOODRIGHT_A11Y_BASE_URL=http://127.0.0.1:3150 \
 *   WOODRIGHT_PROMO_ARTIFACT_DIR=tmp/promotion-window-qa \
 *     node apps/storefront/scripts/promotion-window.smoke.cjs
 *
 * Optional: WOODRIGHT_PROMO_EXPECT_EMPTY=1 asserts the card is absent
 * (run after disabling the slot in Admin to prove the empty state).
 * Requires playwright (WOODRIGHT_PLAYWRIGHT_PATH or tmp/node_modules/playwright).
 */
const path = require("path")
const fs = require("fs")

function loadPlaywright() {
  const candidates = [
    process.env.WOODRIGHT_PLAYWRIGHT_PATH,
    path.resolve(__dirname, "../../../tmp/node_modules/playwright"),
    path.resolve(process.cwd(), "tmp/node_modules/playwright"),
    "playwright",
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      // Dynamic path candidates for optional Playwright installs.
      return require(c)
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "playwright not found - set WOODRIGHT_PLAYWRIGHT_PATH or install tmp/node_modules/playwright"
  )
}

const { chromium } = loadPlaywright()
const BASE = (process.env.WOODRIGHT_A11Y_BASE_URL || "http://127.0.0.1:3150").replace(/\/$/, "")
const ARTIFACT_DIR = process.env.WOODRIGHT_PROMO_ARTIFACT_DIR || ""
const EXPECT_EMPTY = process.env.WOODRIGHT_PROMO_EXPECT_EMPTY === "1"
const NAV_TIMEOUT = Number(process.env.WOODRIGHT_A11Y_NAV_TIMEOUT_MS || 90000)
/** Rotation interval upper bound (slot clamps to 6-8 s) + transition slack. */
const ROTATION_WAIT_MS = Number(process.env.WOODRIGHT_PROMO_ROTATION_WAIT_MS || 9500)

const VIEWPORTS = [
  { name: "desktop-large", width: 1600, height: 1000, expectPromoIndex: 2 },
  { name: "desktop", width: 1280, height: 900, expectPromoIndex: 2 },
  { name: "tablet", width: 900, height: 1100, expectPromoIndex: 2 },
  { name: "mobile", width: 390, height: 844, expectPromoIndex: 2 },
]

const results = []
let failures = 0

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const tag = ok ? "PASS" : "FAIL"
  if (!ok) failures += 1
  console.log(`${tag} ${name}${detail ? ` - ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
}

async function shot(page, name) {
  if (!ARTIFACT_DIR) return
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false })
}

function parseRub(text) {
  const m = String(text).replace(/\s|\u00a0|\u202f/g, "").match(/(\d+)₽/)
  return m ? Number(m[1]) : null
}

async function gridSnapshot(page) {
  return page.evaluate(() => {
    const ul = document.querySelector(".catalog-product-grid")
    if (!ul) return null
    const lis = Array.from(ul.children)
    const promoIndex = lis.findIndex((li) => li.querySelector("[data-promotion-card]"))
    const rects = lis.slice(0, 4).map((li) => {
      const r = li.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    })
    const card = ul.querySelector("[data-promotion-card]")
    const stage = card && card.querySelector(".promotion-card-stage")
    const stageRect = stage ? stage.getBoundingClientRect() : null
    return {
      count: lis.length,
      promoIndex,
      rects,
      active: card ? card.getAttribute("data-promotion-active") : null,
      running: card ? card.getAttribute("data-promotion-running") : null,
      itemCount: card ? Number(card.getAttribute("data-promotion-count")) : 0,
      stage: stageRect ? { w: Math.round(stageRect.width), h: Math.round(stageRect.height) } : null,
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
}

async function checkPlacement(browser) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)
    await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" })
    const snap = await gridSnapshot(page)
    if (!snap) {
      record(`grid:${vp.name}`, false, "catalog grid not found")
      await context.close()
      continue
    }
    if (EXPECT_EMPTY) {
      record(`empty-state:${vp.name}`, snap.promoIndex === -1, { count: snap.count })
    } else {
      const at = Math.min(vp.expectPromoIndex, Math.max(0, snap.count - 1))
      record(`placement:${vp.name}`, snap.promoIndex === at, { promoIndex: snap.promoIndex, expected: at })
      // Same row as the neighbours on ≥3 columns; square media on every breakpoint.
      if (vp.width > 1180) {
        const [a, , c] = snap.rects
        record(`row-align:${vp.name}`, a && c && Math.abs(a.y - c.y) <= 1, { a: a && a.y, c: c && c.y })
        record(`equal-height:${vp.name}`, a && c && Math.abs(a.h - c.h) <= 2, { a: a && a.h, c: c && c.h })
      }
      record(`square-stage:${vp.name}`, snap.stage && Math.abs(snap.stage.w - snap.stage.h) <= 1, snap.stage)
    }
    record(`no-overflow:${vp.name}`, snap.docWidth <= snap.viewportWidth + 1, {
      docWidth: snap.docWidth,
      viewportWidth: snap.viewportWidth,
    })
    await page.evaluate(() => {
      const card = document.querySelector("[data-promotion-card]")
      if (card) card.scrollIntoView({ block: "center" })
      else window.scrollTo(0, 0)
    })
    await page.waitForTimeout(400)
    await shot(page, `${EXPECT_EMPTY ? "empty-" : ""}catalog-${vp.name}`)
    await context.close()
  }
}

async function checkRotation(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(NAV_TIMEOUT)
  await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" })
  const card = page.locator("[data-promotion-card]")
  const count = Number(await card.getAttribute("data-promotion-count"))
  const first = await card.getAttribute("data-promotion-active")
  const stageBefore = await card.locator(".promotion-card-stage").boundingBox()
  await shot(page, "rotation-frame-1")

  if (count <= 1) {
    record("one-item-static", (await card.getAttribute("data-promotion-running")) === "false", { count })
    // Static: index must not move.
    await page.waitForTimeout(ROTATION_WAIT_MS)
    record("one-item-no-tick", (await card.getAttribute("data-promotion-active")) === first)
    await context.close()
    return
  }

  record("multi-item-running", (await card.getAttribute("data-promotion-running")) === "true", { count })
  // Mouse away from the card so hover does not pause it.
  await page.mouse.move(5, 5)
  await page.waitForTimeout(ROTATION_WAIT_MS)
  const second = await card.getAttribute("data-promotion-active")
  record("rotation-advances", second && second !== first, { first, second })
  const stageAfter = await card.locator(".promotion-card-stage").boundingBox()
  record(
    "no-layout-shift",
    stageBefore && stageAfter && Math.abs(stageBefore.height - stageAfter.height) < 1 && Math.abs(stageBefore.y - stageAfter.y) < 1,
    { before: stageBefore && Math.round(stageBefore.height), after: stageAfter && Math.round(stageAfter.height) }
  )
  await shot(page, "rotation-frame-2")

  // Hover pauses.
  await card.hover()
  await page.waitForTimeout(300)
  record("hover-pauses", (await card.getAttribute("data-promotion-running")) === "false")
  await shot(page, "hover-state")
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  record("hover-resumes", (await card.getAttribute("data-promotion-running")) === "true")

  // Keyboard focus pauses + visible focus ring on the media link.
  await card.locator(".promotion-card-media-link").focus()
  await page.waitForTimeout(200)
  record("focus-pauses", (await card.getAttribute("data-promotion-running")) === "false")
  const outline = await page.evaluate(() => {
    const el = document.activeElement
    if (!el) return null
    const cs = getComputedStyle(el)
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth }
  })
  record("focus-visible-outline", outline && outline.outlineStyle !== "none" && outline.outlineWidth !== "0px", outline)
  await shot(page, "focus-state")

  // Thumb rail: manual select, aria-pressed, accessible label.
  const dots = card.locator(".promotion-card-thumb")
  record("thumbs-count", (await dots.count()) === count, { thumbs: await dots.count(), count })
  await dots.nth(0).click()
  await page.waitForTimeout(200)
  const afterSelect = await card.getAttribute("data-promotion-active")
  record("thumb-select", afterSelect === first, { afterSelect, first })
  record("thumb-aria-pressed", (await dots.nth(0).getAttribute("aria-pressed")) === "true")

  // Hidden images are aria-hidden; exactly one active.
  const imgState = await card.locator(".promotion-card-img").evaluateAll((imgs) => ({
    active: imgs.filter((i) => i.classList.contains("is-active")).length,
    hiddenInactive: imgs.filter((i) => !i.classList.contains("is-active")).every((i) => i.getAttribute("aria-hidden") === "true"),
    total: imgs.length,
  }))
  record("single-active-image", imgState.active === 1 && imgState.hiddenInactive, imgState)

  // Sale price semantics: <s> + sr-only prefix.
  const priceText = await card.locator(".promotion-card-price").innerText()
  const sr = await card.locator(".promotion-card-price .sr-only").first().innerText()
  record("price-sr-prefix", /Обычная цена/.test(sr), sr)
  record("price-has-strike", (await card.locator(".promotion-card-price s").count()) === 1, priceText.replace(/\n/g, " | "))

  await context.close()
}

async function checkReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(NAV_TIMEOUT)
  await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" })
  const card = page.locator("[data-promotion-card]")
  await page.waitForTimeout(300)
  const first = await card.getAttribute("data-promotion-active")
  record("reduced-motion-static", (await card.getAttribute("data-promotion-running")) === "false")
  await page.mouse.move(5, 5)
  await page.waitForTimeout(ROTATION_WAIT_MS)
  record("reduced-motion-no-tick", (await card.getAttribute("data-promotion-active")) === first)
  // Manual navigation still works.
  const dots = card.locator(".promotion-card-thumb")
  if ((await dots.count()) > 1) {
    await dots.nth(1).click()
    await page.waitForTimeout(150)
    record("reduced-motion-manual-select", (await card.getAttribute("data-promotion-active")) !== first)
  }
  await shot(page, "reduced-motion")
  await context.close()
}

async function checkCommerce(browser) {
  // Each rotating product: promo card → PDP → cart; card price == PDP price == cart line total.
  const probe = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const probePage = await probe.newPage()
  probePage.setDefaultNavigationTimeout(NAV_TIMEOUT)
  await probePage.goto(`${BASE}/catalog`, { waitUntil: "networkidle" })
  const card = probePage.locator("[data-promotion-card]")
  const count = Number(await card.getAttribute("data-promotion-count"))
  const items = []
  for (let i = 0; i < count; i += 1) {
    if (count > 1) {
      await card.locator(".promotion-card-thumb").nth(i).click()
      await probePage.waitForTimeout(150)
    }
    const id = await card.getAttribute("data-promotion-active")
    const href = await card.locator(".promotion-card-media-link").getAttribute("href")
    const now = await card.locator(".promotion-card-price-now").innerText()
    const was = await card.locator(".promotion-card-price-was s").innerText()
    const title = await card.locator("h3").innerText()
    items.push({ id, href, title, sale: parseRub(now), original: parseRub(was) })
  }
  await probe.close()

  for (const item of items) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)
    await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" })
    const card = page.locator("[data-promotion-card]")
    if (items.length > 1) {
      const idx = items.indexOf(item)
      await card.locator(".promotion-card-thumb").nth(idx).click()
      await page.waitForTimeout(150)
    }
    record(`promo-href:${item.id}`, item.href === `/product/${item.id}`, item.href)
    record(`promo-sale-lower:${item.id}`, item.sale != null && item.original != null && item.sale < item.original, {
      sale: item.sale,
      original: item.original,
    })

    await Promise.all([
      page.waitForURL(`**${item.href}`),
      card.locator(".promotion-card-media-link").click(),
    ])
    await page.waitForLoadState("networkidle")
    const pdpPrice = await page.locator(".product-detail-price").first().innerText()
    const pdpNow = parseRub(pdpPrice.split("\n")[0]) ?? parseRub(pdpPrice)
    const pdpWas = (await page.locator(".product-detail-price s").count())
      ? parseRub(await page.locator(".product-detail-price s").innerText())
      : null
    record(`pdp-sale-price:${item.id}`, pdpNow === item.sale, { pdp: pdpNow, card: item.sale })
    record(`pdp-original-price:${item.id}`, pdpWas === item.original, { pdp: pdpWas, card: item.original })
    await shot(page, `pdp-${item.id}`)

    const addBtn = page.getByRole("button", { name: /Добавить в корзину/ })
    await addBtn.first().click()
    // Wait for the cart badge / link to appear, then open the cart.
    await page.waitForTimeout(1500)
    await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" })
    await page.waitForSelector(".cart-line", { timeout: NAV_TIMEOUT })
    const lines = await page.locator(".cart-line").evaluateAll((els) =>
      els.map((li) => ({
        title: (li.querySelector(".cart-line-title") || {}).textContent || "",
        qtyPrice: (li.querySelector(".cart-line-qty-price") || {}).textContent || "",
      }))
    )
    const line = lines.find((l) => l.title.trim() === item.title.trim()) || lines[0]
    const lineTotal = line ? parseRub(line.qtyPrice) : null
    record(`cart-line-price:${item.id}`, lineTotal === item.sale, { cart: lineTotal, card: item.sale, lines })
    await shot(page, `cart-${item.id}`)
    await context.close()
  }
  return items
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  let items = []
  try {
    await checkPlacement(browser)
    if (!EXPECT_EMPTY) {
      await checkRotation(browser)
      await checkReducedMotion(browser)
      items = await checkCommerce(browser)
    }
  } finally {
    await browser.close()
  }
  if (ARTIFACT_DIR) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "promotion-window-smoke.json"),
      JSON.stringify({ base: BASE, at: new Date().toISOString(), expectEmpty: EXPECT_EMPTY, items, results }, null, 2)
    )
  }
  console.log(`\npromotion-window smoke: ${results.length - failures}/${results.length} passed`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
