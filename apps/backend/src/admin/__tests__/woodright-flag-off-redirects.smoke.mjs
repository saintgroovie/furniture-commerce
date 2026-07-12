/**
 * Flag-off redirect + single-sidebar smoke for Woodright Admin UX polish.
 *
 * Prerequisites: Medusa on WR_BASE (default http://localhost:9001), Playwright.
 * Run:
 *   NODE_PATH=/tmp/b5-playwright-qa/node_modules node src/admin/__tests__/woodright-flag-off-redirects.smoke.mjs
 */
import { createRequire } from "node:module"
const require = createRequire("/tmp/b5-playwright-qa/package.json")
const { chromium } = require("playwright")

const BASE = process.env.WR_BASE || "http://localhost:9001"
const STD = process.env.WR_PRODUCT_ID || "prod_01KX9PD26JVQJS4M811SPZZRDV"
const pageErrors = []

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on("pageerror", (e) => pageErrors.push(String(e.message || e)))

await page.goto(`${BASE}/app/login`, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.locator('input[type="email"], input[name="email"]').first().fill("admin@woodright.ru")
await page.locator('input[type="password"], input[name="password"]').first().fill("admin123")
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(/\/app(?!\/login)/, { timeout: 120000 })
await page.waitForTimeout(1200)

// Flag on: single Woodright sidebar label, no stub tabs, promotions tab renamed
await page.evaluate(() => {
  localStorage.removeItem("WOODRIGHT_ADMIN_UX_V1")
  localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "1")
})
await page.goto(`${BASE}/app/woodright`, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 })
await page.waitForTimeout(2000)
let text = await page.locator("body").innerText()
assert(/Очередь/i.test(text), "queue section missing on dashboard")
assert(/довести карточку/i.test(text), "task framing missing on dashboard")
assert(!/Флаг WOODRIGHT_ADMIN_UX_V1/i.test(text), "flag jargon still in primary UI")
assert(!/Функция выключена/i.test(text), "stub still visible with flag on")
// Sidebar: dashboard present; duplicate «Акции» nav peer should be gone (Extensions may still show dashboard only)
const sidebarLinks = await page.locator("nav a, aside a, [role='navigation'] a").allTextContents()
const woodrightNav = sidebarLinks.filter((t) => /Рабочий стол Woodright/i.test(t))
const promoNavPeers = sidebarLinks.filter((t) => /^Акции$/i.test(t.trim()))
assert(woodrightNav.length >= 1, "dashboard nav missing")
assert(promoNavPeers.length === 0, `extra Акции sidebar peer still present: ${promoNavPeers.join("|")}`)

await page.goto(`${BASE}/app/woodright/products/${STD}`, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.waitForTimeout(2000)
text = await page.locator("body").innerText()
assert(/Акции товара/i.test(text), "product promotions tab missing")
assert(!/\bскоро\b/i.test(text), "скоро badge still present")
assert(!/role=\"tab\"[^>]*>\\s*Наличие/i.test(await page.content()), "inventory still a tab")
// Tablist should not include dedicated Inventory/SEO tabs
const tabLabels = await page.locator('[role="tab"]').allTextContents()
assert(!tabLabels.some((t) => /^Наличие$/i.test(t.trim())), `inventory tab present: ${tabLabels.join("|")}`)
assert(!tabLabels.some((t) => /^SEO$/i.test(t.trim())), `seo tab present: ${tabLabels.join("|")}`)

// Flag off redirects
await page.evaluate(() => localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "0"))

const redirects = [
  [`${BASE}/app/woodright`, /\/app\/?(\?|$)/],
  [`${BASE}/app/woodright/products/${STD}`, new RegExp(`/app/products/${STD}`)],
  [`${BASE}/app/woodright/promotions`, /\/app\/promotions/],
  [`${BASE}/app/woodright/promotions/new`, /\/app\/promotions/],
]
for (const [url, re] of redirects) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForTimeout(1500)
  assert(re.test(page.url()), `flag-off redirect failed for ${url} → ${page.url()}`)
  const body = await page.locator("body").innerText()
  assert(!/Функция выключена/i.test(body), `stub shown after redirect from ${url}`)
}

assert(pageErrors.length === 0, `pageerrors: ${pageErrors.join(" | ")}`)
console.log(JSON.stringify({ ok: true, pageErrors }, null, 2))
await browser.close()
