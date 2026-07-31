#!/usr/bin/env node
/**
 * Keyboard / dialog smoke for buyer mobile nav + catalog filters.
 *
 * Not a CI gate — optional local / operator smoke.
 *
 *   node apps/storefront/scripts/a11y-dialog-keyboard.smoke.cjs
 *   WOODRIGHT_A11Y_BASE_URL=https://woodright-demo.ru node ...
 *
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
const BASE = process.env.WOODRIGHT_A11Y_BASE_URL || "https://woodright-demo.ru"
const STEP_MS = Number(process.env.WOODRIGHT_A11Y_STEP_MS || 250)
const NAV_TIMEOUT = Number(process.env.WOODRIGHT_A11Y_NAV_TIMEOUT_MS || 60000)

let failed = 0
const pageErrors = []

function fail(msg, detail) {
  failed += 1
  console.error("FAIL", msg, detail ? JSON.stringify(detail) : "")
}

function pass(msg) {
  console.log("PASS", msg)
}

async function sleep(page, ms = STEP_MS) {
  await page.waitForTimeout(ms)
}

async function openMobileNav(page) {
  await page.locator("button.mobile-nav-btn").focus()
  await page.keyboard.press("Enter")
  await sleep(page)
}

async function openFilters(page) {
  const toggle = page.locator("button.catalog-filter-mobile-toggle")
  await toggle.waitFor({ state: "visible", timeout: 20000 })
  // Slow catalog SSR/hydration: retry click until sidebar open class appears.
  for (let i = 0; i < 6; i++) {
    await toggle.click({ timeout: 5000 }).catch(() => {})
    await sleep(page, 350)
    const open = await page.evaluate(() =>
      !!document
        .querySelector(".catalog-filter-sidebar")
        ?.classList.contains("catalog-filter-sidebar-open")
    )
    if (open) return
  }
}

async function assertNavOpenContract(page, label) {
  const navOpen = await page.evaluate(() => {
    const panel = document.getElementById("mobile-nav-panel")
    return {
      role: panel?.getAttribute("role"),
      modal: panel?.getAttribute("aria-modal"),
      open: panel?.getAttribute("data-open"),
      headerTopInert: document
        .querySelector("header .header-top")
        ?.hasAttribute("inert"),
      headerMainInert: document
        .querySelector("header .header-main")
        ?.hasAttribute("inert"),
      mainInert: document.getElementById("main-content")?.hasAttribute("inert"),
      footerInert: document.querySelector("footer")?.hasAttribute("inert"),
      focusInPanel: panel?.contains(document.activeElement),
      btnInert: document.querySelector(".mobile-nav-btn")?.hasAttribute("inert"),
    }
  })
  if (
    navOpen.role === "dialog" &&
    navOpen.modal === "true" &&
    navOpen.open === "true" &&
    navOpen.headerTopInert &&
    navOpen.headerMainInert &&
    navOpen.mainInert &&
    navOpen.footerInert &&
    navOpen.focusInPanel &&
    !navOpen.btnInert
  ) {
    pass(label)
  } else {
    fail(label, navOpen)
  }
  return navOpen
}

async function assertNavClosed(page, label) {
  const navClosed = await page.evaluate(() => ({
    open: document.getElementById("mobile-nav-panel")?.getAttribute("data-open"),
    mainInert: document.getElementById("main-content")?.hasAttribute("inert"),
    headerTopInert: document
      .querySelector("header .header-top")
      ?.hasAttribute("inert"),
    footerInert: document.querySelector("footer")?.hasAttribute("inert"),
    focusBtn:
      document.activeElement === document.querySelector(".mobile-nav-btn"),
  }))
  if (
    navClosed.open === "false" &&
    !navClosed.mainInert &&
    !navClosed.headerTopInert &&
    !navClosed.footerInert
  ) {
    pass(label)
  } else {
    fail(label, navClosed)
  }
  return navClosed
}

async function assertFiltersOpenContract(page, label) {
  const filtOpen = await page.evaluate(() => {
    const aside = document.querySelector(".catalog-filter-sidebar")
    const productLink = document.querySelector(
      ".catalog-product-area a, .catalog-product-area button"
    )
    const tab = document.querySelector(".catalog-controls a, .catalog-controls button")
    const search = document.querySelector(".catalog-search input, .catalog-search button")
    const sort = document.querySelector(".catalog-sort button, .catalog-sort select")
    const underInert = (el) =>
      !el || !!(el.closest("[inert]") || el.hasAttribute("inert"))
    return {
      open: aside?.classList.contains("catalog-filter-sidebar-open"),
      role: aside?.getAttribute("role"),
      modal: aside?.getAttribute("aria-modal"),
      label: aside?.getAttribute("aria-label"),
      headerTopInert: document
        .querySelector("header .header-top")
        ?.hasAttribute("inert"),
      productInert: document
        .querySelector(".catalog-product-area")
        ?.hasAttribute("inert"),
      controlsInert: document
        .querySelector(".catalog-controls")
        ?.hasAttribute("inert"),
      searchInert: document.querySelector(".catalog-search")?.hasAttribute("inert"),
      sortInert: document.querySelector(".catalog-sort")?.hasAttribute("inert"),
      footerInert: document.querySelector("footer")?.hasAttribute("inert"),
      focusInAside: aside?.contains(document.activeElement),
      toggleInert: document
        .querySelector(".catalog-filter-mobile-toggle")
        ?.hasAttribute("inert"),
      productFocusable: productLink ? !underInert(productLink) : null,
      tabFocusable: tab ? !underInert(tab) : null,
      searchFocusable: search ? !underInert(search) : null,
      sortFocusable: sort ? !underInert(sort) : null,
    }
  })
  if (
    filtOpen.open &&
    filtOpen.role === "dialog" &&
    filtOpen.modal === "true" &&
    filtOpen.label &&
    filtOpen.headerTopInert &&
    filtOpen.productInert &&
    filtOpen.controlsInert &&
    filtOpen.searchInert &&
    filtOpen.sortInert &&
    filtOpen.footerInert &&
    filtOpen.focusInAside &&
    !filtOpen.toggleInert &&
    filtOpen.productFocusable === false &&
    filtOpen.tabFocusable === false &&
    filtOpen.searchFocusable === false &&
    filtOpen.sortFocusable === false
  ) {
    pass(label)
  } else {
    fail(label, filtOpen)
  }
  return filtOpen
}

async function assertFiltersClosed(page, label, expectFocusToggle = false) {
  const filtClosed = await page.evaluate(() => ({
    open: document
      .querySelector(".catalog-filter-sidebar")
      ?.classList.contains("catalog-filter-sidebar-open"),
    focusToggle:
      document.activeElement ===
      document.querySelector(".catalog-filter-mobile-toggle"),
    productInert: document
      .querySelector(".catalog-product-area")
      ?.hasAttribute("inert"),
    controlsInert: document
      .querySelector(".catalog-controls")
      ?.hasAttribute("inert"),
    searchInert: document.querySelector(".catalog-search")?.hasAttribute("inert"),
    sortInert: document.querySelector(".catalog-sort")?.hasAttribute("inert"),
    headerTopInert: document
      .querySelector("header .header-top")
      ?.hasAttribute("inert"),
    footerInert: document.querySelector("footer")?.hasAttribute("inert"),
    role: document
      .querySelector(".catalog-filter-sidebar")
      ?.getAttribute("role"),
  }))
  const focusOk = expectFocusToggle ? filtClosed.focusToggle : true
  if (
    !filtClosed.open &&
    !filtClosed.productInert &&
    !filtClosed.controlsInert &&
    !filtClosed.searchInert &&
    !filtClosed.sortInert &&
    !filtClosed.headerTopInert &&
    !filtClosed.footerInert &&
    filtClosed.role !== "dialog" &&
    focusOk
  ) {
    pass(label)
  } else {
    fail(label, filtClosed)
  }
  return filtClosed
}

async function assertTabTrap(page, panelSelector, triggerSelector, steps, label) {
  let trapOk = true
  let detail = null
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab")
    const info = await page.evaluate(
      ({ panelSelector, triggerSelector }) => {
        const panel = document.querySelector(panelSelector)
        const btn = document.querySelector(triggerSelector)
        const el = document.activeElement
        return {
          ok: !!(panel && panel.contains(el)) || el === btn,
          tag: el?.tagName,
          cls: el?.className,
        }
      },
      { panelSelector, triggerSelector }
    )
    if (!info.ok) {
      trapOk = false
      detail = info
      break
    }
  }
  if (trapOk) pass(label)
  else fail(label, detail)
}

async function assertShiftTabTrap(page, panelSelector, triggerSelector, steps, label) {
  let trapOk = true
  let detail = null
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Shift+Tab")
    const info = await page.evaluate(
      ({ panelSelector, triggerSelector }) => {
        const panel = document.querySelector(panelSelector)
        const btn = document.querySelector(triggerSelector)
        const el = document.activeElement
        return {
          ok: !!(panel && panel.contains(el)) || el === btn,
          tag: el?.tagName,
          cls: el?.className,
        }
      },
      { panelSelector, triggerSelector }
    )
    if (!info.ok) {
      trapOk = false
      detail = info
      break
    }
  }
  if (trapOk) pass(label)
  else fail(label, detail)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  page.on("pageerror", (err) => pageErrors.push(String(err)))
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    // Local review builds often 404 media assets; ignore pure resource 404 noise.
    if (/Failed to load resource:.*404/i.test(text)) return
    // Degraded local Medusa static (:9000 keep-alive hang) surfaces as 500 on
    // /product-static|/static proxy — layout/dialog QA must not fail on that.
    if (/Failed to load resource:.*500/i.test(text)) return
    // Next.js soft-nav fallbacks during keyboard smoke / filter apply are noisy.
    if (/Failed to fetch RSC payload/i.test(text)) return
    pageErrors.push(`console:${text}`)
  })

  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })

    // --- Mobile nav: open / trap / Escape / restore ---
    await openMobileNav(page)
    await assertNavOpenContract(page, "mobile_nav_open_dialog_inert")
    await assertTabTrap(
      page,
      "#mobile-nav-panel",
      ".mobile-nav-btn",
      16,
      "mobile_nav_focus_trap"
    )
    await assertShiftTabTrap(
      page,
      "#mobile-nav-panel",
      ".mobile-nav-btn",
      8,
      "mobile_nav_shift_tab_trap"
    )
    await page.keyboard.press("Escape")
    await sleep(page)
    await assertNavClosed(page, "mobile_nav_escape_restore")
    const escFocus = await page.evaluate(
      () => document.activeElement === document.querySelector(".mobile-nav-btn")
    )
    if (escFocus) pass("mobile_nav_escape_focus_btn")
    else fail("mobile_nav_escape_focus_btn")

    // Toggle close
    await openMobileNav(page)
    await page.locator("button.mobile-nav-btn").click()
    await sleep(page)
    await assertNavClosed(page, "mobile_nav_toggle_close")

    // Route link cleanup
    await openMobileNav(page)
    await page.locator("#mobile-nav-panel a[href='/catalog']").click()
    await page.waitForURL(/\/catalog/, { timeout: NAV_TIMEOUT })
    await sleep(page, 400)
    await assertNavClosed(page, "mobile_nav_route_link_cleanup")

    // --- Catalog filters ---
    await page.goto(`${BASE}/catalog`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    })
    await page.locator("button.catalog-filter-mobile-toggle").waitFor({
      state: "visible",
      timeout: 20000,
    })
    await sleep(page, 500)
    await openFilters(page)
    await assertFiltersOpenContract(page, "catalog_filters_open_dialog_inert")
    await assertTabTrap(
      page,
      ".catalog-filter-sidebar",
      ".catalog-filter-mobile-toggle",
      40,
      "catalog_filters_focus_trap"
    )
    await assertShiftTabTrap(
      page,
      ".catalog-filter-sidebar",
      ".catalog-filter-mobile-toggle",
      12,
      "catalog_filters_shift_tab_trap"
    )

    // Background product should not take focus while open
    const bgFocus = await page.evaluate(() => {
      const link = document.querySelector(
        ".catalog-product-area a, .catalog-product-area button"
      )
      if (!link) return { ok: true, reason: "no_product_link" }
      try {
        link.focus()
      } catch {
        /* inert may throw in some engines */
      }
      const active = document.activeElement
      const aside = document.querySelector(".catalog-filter-sidebar")
      return {
        ok: !(link === active) && !!aside?.contains(active),
        activeTag: active?.tagName,
      }
    })
    if (bgFocus.ok) pass("catalog_filters_background_no_focus")
    else fail("catalog_filters_background_no_focus", bgFocus)

    await page.keyboard.press("Escape")
    await sleep(page, 300)
    await assertFiltersClosed(page, "catalog_filters_escape_restore", true)

    // Close via apply/show button
    await openFilters(page)
    await page
      .locator(".catalog-filter-sidebar button")
      .filter({ hasText: /Показать|Close|Закрыть/i })
      .first()
      .click()
      .catch(async () => {
        // Fallback: click the footer close that calls closeMobileFilters
        await page.locator(".catalog-filter-sidebar").evaluate((aside) => {
          const btns = Array.from(aside.querySelectorAll("button"))
          const hit = btns.find((b) => /Показать/i.test(b.textContent || ""))
          hit?.click()
        })
      })
    await sleep(page, 300)
    await assertFiltersClosed(page, "catalog_filters_close_button", true)

    // Double open/close — no stale inert / duplicate trap
    await openFilters(page)
    await page.keyboard.press("Escape")
    await sleep(page)
    await openFilters(page)
    await assertFiltersOpenContract(page, "catalog_filters_reopen_contract")
    await page.keyboard.press("Escape")
    await sleep(page)
    await assertFiltersClosed(page, "catalog_filters_reopen_cleanup", true)

    // After close, product area focusable again
    const afterCloseFocus = await page.evaluate(() => {
      const link = document.querySelector(
        ".catalog-product-area a, .catalog-product-area button"
      )
      if (!link) return { ok: true }
      link.focus()
      return { ok: document.activeElement === link }
    })
    if (afterCloseFocus.ok) pass("catalog_filters_background_refocus")
    else fail("catalog_filters_background_refocus", afterCloseFocus)

    // Viewport → desktop clears drawer + inert
    await openFilters(page)
    await assertFiltersOpenContract(page, "catalog_filters_before_desktop")
    await page.setViewportSize({ width: 1200, height: 800 })
    await sleep(page, 500)
    const desktop = await page.evaluate(() => ({
      open: document
        .querySelector(".catalog-filter-sidebar")
        ?.classList.contains("catalog-filter-sidebar-open"),
      role: document
        .querySelector(".catalog-filter-sidebar")
        ?.getAttribute("role"),
      productInert: document
        .querySelector(".catalog-product-area")
        ?.hasAttribute("inert"),
      headerTopInert: document
        .querySelector("header .header-top")
        ?.hasAttribute("inert"),
    }))
    if (
      !desktop.open &&
      desktop.role !== "dialog" &&
      !desktop.productInert &&
      !desktop.headerTopInert
    ) {
      pass("catalog_filters_viewport_desktop_cleanup")
    } else {
      fail("catalog_filters_viewport_desktop_cleanup", desktop)
    }

    // Desktop: sidebar present without dialog semantics
    const desktopSidebar = await page.evaluate(() => {
      const aside = document.querySelector(".catalog-filter-sidebar")
      return {
        visible: !!aside && getComputedStyle(aside).display !== "none",
        role: aside?.getAttribute("role"),
        modal: aside?.getAttribute("aria-modal"),
      }
    })
    if (
      desktopSidebar.visible &&
      desktopSidebar.role !== "dialog" &&
      desktopSidebar.modal !== "true"
    ) {
      pass("catalog_filters_desktop_no_dialog")
    } else {
      fail("catalog_filters_desktop_no_dialog", desktopSidebar)
    }

    if (pageErrors.length) {
      fail("page_or_console_errors", pageErrors.slice(0, 8))
    } else {
      pass("no_page_console_errors")
    }
  } finally {
    await browser.close()
  }

  if (failed) {
    console.error(`a11y-dialog-keyboard.smoke: FAILED (${failed})`)
    process.exit(1)
  }
  console.log("a11y-dialog-keyboard.smoke: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
