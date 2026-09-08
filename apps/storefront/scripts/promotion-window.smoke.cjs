#!/usr/bin/env node
/**
 * Promotion Window browser smoke: right-gutter rail placement per breakpoint
 * (visible ≥ 1500px, absent below, grid never touched), sticky behaviour,
 * rotation, pause on hover / focus, prefers-reduced-motion, promo → PDP → cart
 * economics for every rotating product, plus visual evidence screenshots.
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

/* Placement contract (lib/promotion-window-placement.ts): the window is a
   separate sticky card in the RIGHT gutter next to the grid, visible only
   where that gutter can hold a legible card (≥ 1500px). Narrower viewports:
   no window, grid untouched. */
const VIEWPORTS = [
  { name: "desktop-xl", width: 1920, height: 1080, expectRail: true },
  { name: "desktop-large", width: 1600, height: 1000, expectRail: true },
  { name: "macbook-14", width: 1512, height: 982, expectRail: true },
  { name: "desktop", width: 1440, height: 900, expectRail: false },
  { name: "laptop", width: 1280, height: 900, expectRail: false },
  { name: "tablet", width: 900, height: 1100, expectRail: false },
  { name: "mobile", width: 390, height: 844, expectRail: false },
]
/** Viewport for rotation / a11y / commerce checks (rail visible). */
const WIDE = { width: 1600, height: 1000 }

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
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
      }
    }
    const rail = document.querySelector(".catalog-promo-sidebar")
    const railVisible = Boolean(rail && getComputedStyle(rail).display !== "none")
    const card = document.querySelector("[data-promotion-card]")
    const stage = card && card.querySelector(".promotion-card-stage")
    const filter = document.querySelector(".catalog-filter-sidebar")
    return {
      count: lis.length,
      promoInGrid: lis.some((li) => li.querySelector("[data-promotion-card]")),
      grid: rect(ul),
      firstCard: lis[0] ? rect(lis[0]) : null,
      railPresent: Boolean(rail),
      railVisible,
      rail: railVisible ? rect(rail) : null,
      card: railVisible && card ? rect(card) : null,
      filter: filter && getComputedStyle(filter).display !== "none" ? rect(filter) : null,
      active: card ? card.getAttribute("data-promotion-active") : null,
      running: card ? card.getAttribute("data-promotion-running") : null,
      itemCount: card ? Number(card.getAttribute("data-promotion-count")) : 0,
      stage: railVisible && stage ? rect(stage) : null,
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
    // The grid is never touched by the window - no promo <li> at any width.
    record(`grid-products-only:${vp.name}`, !snap.promoInGrid, { count: snap.count })
    if (EXPECT_EMPTY) {
      record(`empty-state:${vp.name}`, !snap.railPresent, { railPresent: snap.railPresent })
    } else if (vp.expectRail) {
      record(`rail-visible:${vp.name}`, snap.railVisible, { railPresent: snap.railPresent })
      if (snap.railVisible && snap.rail && snap.card) {
        // Right of the last column: rail starts after the grid's right edge (+ gap).
        record(`rail-right-of-grid:${vp.name}`, snap.rail.x >= snap.grid.right + 16, {
          gridRight: snap.grid.right,
          railX: snap.rail.x,
        })
        // Top aligned with the first product row.
        record(`rail-top-aligned:${vp.name}`, snap.firstCard && Math.abs(snap.card.y - snap.firstCard.y) <= 1, {
          card: snap.card.y,
          firstCard: snap.firstCard && snap.firstCard.y,
        })
        // Mirrors the filter card width (symmetric gutters), never wider than 200px.
        record(`rail-width:${vp.name}`, snap.rail.w > 0 && snap.rail.w <= 200, { w: snap.rail.w })
        // From 1551px the filter card bleeds into the left gutter with the same
        // width formula; below that it sits inside the content at a fixed 176px.
        if (snap.filter && vp.width >= 1551) {
          record(`rail-mirrors-filter:${vp.name}`, Math.abs(snap.rail.w - snap.filter.w) <= 1, {
            rail: snap.rail.w,
            filter: snap.filter.w,
          })
        }
        record(`square-stage:${vp.name}`, snap.stage && Math.abs(snap.stage.w - snap.stage.h) <= 1, snap.stage)
        record(`card-fits-rail:${vp.name}`, snap.card.w <= snap.rail.w + 1, { card: snap.card.w, rail: snap.rail.w })

        // Sticky: after scrolling past the first row the window stays pinned
        // under the header (top ≈ 112px) while the grid moves.
        await page.evaluate(() => window.scrollBy(0, 700))
        await page.waitForTimeout(250)
        const stuck = await page.evaluate(() => {
          const p = document.querySelector(".catalog-promo-panel")
          return p ? Math.round(p.getBoundingClientRect().top) : null
        })
        record(`rail-sticky:${vp.name}`, stuck != null && Math.abs(stuck - 112) <= 2, { top: stuck })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(150)
      }
    } else {
      // No gutter → no window (not folded into the grid, not a banner).
      record(`rail-hidden:${vp.name}`, !snap.railVisible, { railPresent: snap.railPresent })
    }
    record(`no-overflow:${vp.name}`, snap.docWidth <= snap.viewportWidth + 1, {
      docWidth: snap.docWidth,
      viewportWidth: snap.viewportWidth,
    })
    await page.waitForTimeout(300)
    await shot(page, `${EXPECT_EMPTY ? "empty-" : ""}catalog-${vp.name}`)
    await context.close()
  }
}

async function checkRotation(browser) {
  const context = await browser.newContext({ viewport: WIDE })
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
    viewport: WIDE,
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
  const probe = await browser.newContext({ viewport: WIDE })
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
    const context = await browser.newContext({ viewport: WIDE })
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
