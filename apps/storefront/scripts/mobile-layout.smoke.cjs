#!/usr/bin/env node
/**
 * Mobile layout regression smoke (overflow, nav order, cart empty SSR,
 * contacts SoT tokens, PDP main→footer, dialog contracts).
 *
 *   WOODRIGHT_A11Y_BASE_URL=http://127.0.0.1:3136 \
 *     node apps/storefront/scripts/mobile-layout.smoke.cjs
 *
 * Artifacts (optional): WOODRIGHT_MOBILE_AUDIT_DIR=artifacts/mobile-audit-20260729
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
    "playwright not found — set WOODRIGHT_PLAYWRIGHT_PATH or install tmp/node_modules/playwright"
  )
}

const { chromium } = loadPlaywright()
const BASE = process.env.WOODRIGHT_A11Y_BASE_URL || "http://127.0.0.1:3136"
const ARTIFACT_DIR = process.env.WOODRIGHT_MOBILE_AUDIT_DIR || ""
const NAV_TIMEOUT = Number(process.env.WOODRIGHT_A11Y_NAV_TIMEOUT_MS || 90000)

const VIEWPORTS = [
  { name: "320", width: 320, height: 568, deviceScaleFactor: 2 },
  { name: "390", width: 390, height: 844, deviceScaleFactor: 2 },
  { name: "430", width: 430, height: 932, deviceScaleFactor: 2 },
  /* Boundary widths for CSS breakpoints touched by this audit. */
  { name: "768", width: 768, height: 1024, deviceScaleFactor: 2 },
  { name: "769", width: 769, height: 1024, deviceScaleFactor: 1 },
  { name: "900", width: 900, height: 1024, deviceScaleFactor: 1 },
  { name: "901", width: 901, height: 1024, deviceScaleFactor: 1 },
  { name: "1440", width: 1440, height: 1000, deviceScaleFactor: 1 },
]

/** Full matrix on phone widths; boundary/desktop check critical routes only. */
const BOUNDARY_ROUTES = ["/", "/catalog", "/contacts", "/cart", "/bespoke/request"]

const ROUTES = [
  "/",
  "/catalog",
  "/catalog?product_type=STANDARD",
  "/catalog?product_type=CONFIGURABLE",
  "/kids",
  "/rooms",
  "/bespoke",
  "/about",
  "/contacts",
  "/cart",
  "/bespoke/request",
]

let failed = 0
const pageErrors = []

function fail(msg, detail) {
  failed += 1
  console.error("FAIL", msg, detail ? JSON.stringify(detail).slice(0, 800) : "")
}

function pass(msg) {
  console.log("PASS", msg)
}

async function detectOverflow(page) {
  const run = () =>
    page.evaluate(() => {
      const iw = window.innerWidth
      const docW = document.documentElement.scrollWidth
      const bodyW = document.body.scrollWidth
      const offenders = []
      const nodes = document.body.querySelectorAll("*")
      const isInsideIntendedScroller = (el) => {
        let cur = el
        while (cur && cur !== document.body) {
          const s = getComputedStyle(cur)
          if (
            (s.overflowX === "auto" || s.overflowX === "scroll") &&
            cur.scrollWidth > cur.clientWidth + 1
          ) {
            return true
          }
          cur = cur.parentElement
        }
        return false
      }
      for (const el of nodes) {
        const style = getComputedStyle(el)
        if (style.display === "none" || style.visibility === "hidden") continue
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) continue
        if (r.right > iw + 1 || r.left < -1) {
          if (isInsideIntendedScroller(el)) continue
          const tag = el.tagName.toLowerCase()
          const cls = typeof el.className === "string" ? el.className.slice(0, 80) : ""
          offenders.push({
            tag,
            cls,
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            minWidth: style.minWidth,
            whiteSpace: style.whiteSpace,
            position: style.position,
            overflowX: style.overflowX,
          })
          if (offenders.length >= 12) break
        }
      }
      /* Strict document width gate — intentional rails must be contained so
         they do not inflate scrollWidth. Offenders list aids diagnosis. */
      const pageOverflow = docW > iw + 1 || bodyW > iw + 1
      return {
        innerWidth: iw,
        docScrollWidth: docW,
        bodyScrollWidth: bodyW,
        docOverflow: pageOverflow,
        bodyOverflow: pageOverflow,
        offenders,
      }
    })
  try {
    return await run()
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    if (!/Execution context was destroyed|Target closed|navigation/i.test(msg)) {
      throw err
    }
    await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(400)
    return run()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  page.on("pageerror", (err) => pageErrors.push(String(err)))
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    if (/Failed to load resource:.*404/i.test(text)) return
    // Degraded local Medusa static keep-alive hang → 500 on image proxy.
    if (/Failed to load resource:.*500/i.test(text)) return
    if (/Failed to fetch RSC payload/i.test(text)) return
    pageErrors.push(`console:${text}`)
  })

  if (ARTIFACT_DIR) {
    fs.mkdirSync(path.join(ARTIFACT_DIR, "after"), { recursive: true })
  }

  try {
    // --- Cart empty SSR (no cart_id cookie) ---
    /* Capture initial HTML before hydration settles so a false SSR loading
       shell cannot hide behind a client empty flash. */
    const cartResp = await page.goto(`${BASE}/cart`, {
      waitUntil: "commit",
      timeout: NAV_TIMEOUT,
    })
    const cartHtml = (await cartResp?.text()) || ""
    if (
      /data-state="empty"/.test(cartHtml) &&
      !/Загружаем корзину/i.test(cartHtml)
    ) {
      pass("cart_empty_ssr_html")
    } else {
      fail("cart_empty_ssr_html", {
        hasEmptyAttr: /data-state="empty"/.test(cartHtml),
        hasLoading: /Загружаем корзину/i.test(cartHtml),
      })
    }
    await page.waitForTimeout(400)
    const cartState = await page.evaluate(() => {
      const card = document.querySelector(".bespoke-request-card")
      const text = card?.textContent || ""
      return {
        state: card?.getAttribute("data-state"),
        hasLoading: /Загружаем корзину/i.test(text),
        hasEmpty: /пуст|добав/i.test(text),
      }
    })
    if (cartState.state === "empty" && !cartState.hasLoading) {
      pass("cart_empty_no_infinite_loading")
    } else {
      fail("cart_empty_no_infinite_loading", cartState)
    }

    // --- Contacts SoT tokens ---
    await page.goto(`${BASE}/contacts`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    await page.waitForTimeout(600)
    const contacts = await page.evaluate(() => {
      const t = document.body.innerText
      return {
        visitTitle: /Посетить магазин Woodright/i.test(t),
        contactTitle: /Связаться с[\u00a0\u202f ]Woodright/i.test(t),
        address: /Бутаково/i.test(t) && /Химки/i.test(t),
        phone800: /800.*555.*17.*36|555-17-36/i.test(t),
        phone967: /967.*258.*71.*44|258-71-44/i.test(t),
        telegram: !!document.querySelector('a[href*="t.me"], a[href*="telegram"]'),
        whatsapp: !!document.querySelector('a[href*="wa.me"], a[href*="whatsapp"]'),
        tel: !!document.querySelector('a[href^="tel:"]'),
        map: !!document.querySelector('iframe[src*="yandex"], a[href*="yandex"]'),
      }
    })
    if (
      contacts.visitTitle &&
      contacts.contactTitle &&
      contacts.address &&
      contacts.phone800 &&
      contacts.phone967 &&
      contacts.tel
    ) {
      pass("contacts_sot_visible")
    } else {
      fail("contacts_sot_visible", contacts)
    }

    // --- Mobile nav order ---
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    await page.locator("button.mobile-nav-btn").click()
    await page.waitForTimeout(300)
    const navOrder = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("#mobile-nav-panel .mobile-nav-group:first-child a")
      ).map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim() }))
      return links
    })
    const hrefs = navOrder.map((l) => l.href)
    const okOrder =
      hrefs[0] === "/catalog" &&
      hrefs[1] === "/rooms" &&
      hrefs[2] === "/kids" &&
      hrefs[3] === "/bespoke"
    if (okOrder) pass("mobile_nav_canonical_order")
    else fail("mobile_nav_canonical_order", navOrder)

    const navDialog = await page.evaluate(() => {
      const panel = document.getElementById("mobile-nav-panel")
      return {
        role: panel?.getAttribute("role"),
        modal: panel?.getAttribute("aria-modal"),
        mainInert: document.getElementById("main-content")?.hasAttribute("inert"),
      }
    })
    if (navDialog.role === "dialog" && navDialog.modal === "true" && navDialog.mainInert) {
      pass("mobile_nav_dialog_inert")
    } else {
      fail("mobile_nav_dialog_inert", navDialog)
    }
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)

    // Discover a representative PDP once for boundary overflow checks.
    await page.goto(`${BASE}/catalog`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    await page.waitForTimeout(600)
    const pdpHref = await page.evaluate(() => {
      const a = document.querySelector(
        ".product-card a[href*='/product/'], a.product-card[href], .catalog-product-area a[href*='/product/']"
      )
      return a?.getAttribute("href") || null
    })
    const boundaryRoutes = pdpHref
      ? [...BOUNDARY_ROUTES, pdpHref]
      : BOUNDARY_ROUTES
    if (pdpHref) pass("boundary_pdp_discovered")
    else fail("boundary_pdp_discovered")

    // --- Route matrix overflow ---
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const routesForVp =
        vp.width <= 430 ? ROUTES : boundaryRoutes
      for (const route of routesForVp) {
        const label = `overflow_${vp.name}_${route.replace(/[/?&=]/g, "_")}`
        await page.goto(`${BASE}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT,
        })
        await page.waitForTimeout(500)
        const ov = await detectOverflow(page)
        if (!ov.docOverflow && !ov.bodyOverflow) {
          pass(label)
        } else {
          fail(label, {
            doc: ov.docScrollWidth,
            body: ov.bodyScrollWidth,
            iw: ov.innerWidth,
            offenders: ov.offenders.slice(0, 5),
          })
        }
        if (ARTIFACT_DIR && vp.width <= 430) {
          const safe = `${vp.name}${route === "/" ? "_home" : route.replace(/[/?&=]/g, "_")}.png`
          await page
            .screenshot({
              path: path.join(ARTIFACT_DIR, "after", safe),
              fullPage: false,
            })
            .catch(() => {})
        }
      }
    }

    // --- PDP: main before footer + not stuck on loading ---
    await page.setViewportSize({ width: 390, height: 844 })
    if (!pdpHref) {
      fail("pdp_card_link_missing")
    } else {
      await page.goto(`${BASE}${pdpHref}`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      })
      await page.waitForTimeout(1500)
      const pdp = await page.evaluate(() => {
        const main = document.getElementById("main-content")
        const footer = document.querySelector("footer")
        const loading = /Загружаем…/i.test(main?.textContent || "")
        const h1 = main?.querySelector("h1")
        let mainBeforeFooter = false
        if (main && footer) {
          mainBeforeFooter = !!(
            main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
          )
        }
        const price = main?.textContent?.match(/₽|руб/i)
        return {
          loading,
          hasH1: !!h1,
          mainBeforeFooter,
          hasPrice: !!price,
        }
      })
      if (!pdp.loading && pdp.hasH1 && pdp.mainBeforeFooter) {
        pass("pdp_main_before_footer_ready")
      } else {
        fail("pdp_main_before_footer_ready", pdp)
      }
    }

    // --- Filter drawer dialog ---
    await page.goto(`${BASE}/catalog`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    await page.locator("button.catalog-filter-mobile-toggle").waitFor({
      state: "visible",
      timeout: 20000,
    })
    await page.locator("button.catalog-filter-mobile-toggle").click()
    await page.waitForTimeout(400)
    const filters = await page.evaluate(() => {
      const aside = document.querySelector(".catalog-filter-sidebar")
      return {
        open: aside?.classList.contains("catalog-filter-sidebar-open"),
        role: aside?.getAttribute("role"),
        modal: aside?.getAttribute("aria-modal"),
        productInert: document
          .querySelector(".catalog-product-area")
          ?.hasAttribute("inert"),
      }
    })
    if (
      filters.open &&
      filters.role === "dialog" &&
      filters.modal === "true" &&
      filters.productInert
    ) {
      pass("catalog_filters_dialog_inert")
    } else {
      fail("catalog_filters_dialog_inert", filters)
    }
    await page.keyboard.press("Escape")

    // --- Desktop regression control (nav order in DOM) ---
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    const desktopNav = await page.evaluate(() => {
      const nav = document.querySelector('nav.header-nav')
      if (!nav) return []
      const items = []
      for (const child of Array.from(nav.children)) {
        const a =
          child.matches("a")
            ? child
            : child.querySelector("a.header-nav-link, a.nav-dropdown-trigger, a")
        const href = a?.getAttribute("href")
        if (href) items.push(href)
      }
      return items
    })
    const dOk =
      desktopNav.includes("/catalog") &&
      desktopNav.indexOf("/rooms") > desktopNav.indexOf("/catalog") &&
      desktopNav.indexOf("/kids") > desktopNav.indexOf("/rooms")
    if (dOk) pass("desktop_nav_canonical_order")
    else fail("desktop_nav_canonical_order", desktopNav)

    if (pageErrors.length) fail("page_or_console_errors", pageErrors.slice(0, 8))
    else pass("no_page_console_errors")
  } finally {
    await browser.close()
  }

  if (failed) {
    console.error(`mobile-layout.smoke: FAILED (${failed})`)
    process.exit(1)
  }
  console.log("mobile-layout.smoke: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
