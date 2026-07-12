/**
 * Package B.6 — DOM render smoke for Medusa Admin + Product Workspace.
 *
 * Prerequisites:
 * - Medusa listening on B6_BASE (default http://localhost:9001)
 * - Isolated DB with Package B.5 fixtures + local admin user
 * - Playwright via NODE_PATH=/tmp/b5-playwright-qa/node_modules
 *
 * Run:
 *   NODE_PATH=/tmp/b5-playwright-qa/node_modules B6_BASE=http://localhost:9001 \
 *     node src/admin/__tests__/product-workspace-render.smoke.mjs
 */
import { createRequire } from "node:module"
import fs from "fs"

const require = createRequire("/tmp/b5-playwright-qa/package.json")
const { chromium } = require("playwright")

const BASE = process.env.B6_BASE || "http://localhost:9001"
const STD = process.env.B6_PRODUCT_ID || "prod_01KX9PD26JVQJS4M811SPZZRDV"
const OUT = process.env.B6_SMOKE_OUT || ""

const pageErrors = []
const consoleErrors = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

page.on("pageerror", (err) => pageErrors.push(err.message))
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text()
    if (!/401|favicon|cloud\/auth/i.test(text)) {
      consoleErrors.push(text)
    }
  }
})

async function assert(cond, message) {
  if (!cond) {
    throw new Error(message)
  }
}

// Login
await page.goto(`${BASE}/app/login`, { waitUntil: "networkidle", timeout: 120000 })
await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 60000 })
const bodyLogin = (await page.locator("body").innerText()).trim()
await assert(/Welcome to Medusa|Sign in/i.test(bodyLogin), "login page missing expected copy")
await assert(
  (await page.locator("#medusa").innerHTML()).length > 50,
  "login #medusa shell empty"
)

await page.locator('input[name="email"], input[type="email"]').first().fill("admin@woodright.ru")
await page.locator('input[name="password"], input[type="password"]').first().fill("admin123")
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(5000)

const afterLogin = (await page.locator("body").innerText()).trim()
await assert(!/Welcome to Medusa/i.test(afterLogin), "still on login after submit")
await assert(/Orders|Products|Medusa Store/i.test(afterLogin), "dashboard landmarks missing")

// Stock product page
await page.goto(`${BASE}/app/products/${STD}`, { waitUntil: "networkidle", timeout: 120000 })
await page.waitForTimeout(3000)
const productBody = (await page.locator("body").innerText()).trim()
await assert(/B5 STANDARD|Published|Опубликован/i.test(productBody), "stock product page did not render")

// Flag off → redirect to stock product (no developer stub)
await page.evaluate(() => {
  window.localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "0")
})
await page.goto(`${BASE}/app/woodright/products/${STD}`, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.waitForTimeout(2500)
await assert(
  page.url().includes(`/app/products/${STD}`),
  `flag-off did not redirect to stock product, url=${page.url()}`
)
await assert(!/Функция выключена/i.test(await page.locator("body").innerText()), "flag-off stub still shown")

// Flag on
await page.evaluate(() => {
  window.localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "1")
})
await page.goto(`${BASE}/app/woodright/products/${STD}`, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.waitForTimeout(4000)
const flagOn = (await page.locator("body").innerText()).trim()
await assert(!/Функция выключена/i.test(flagOn), "workspace still disabled with flag on")
await assert(/B5 STANDARD/i.test(flagOn), "workspace product title missing")
await assert(/Сохранить|Save/i.test(flagOn), "workspace save control missing")
await assert(/Акции товара/i.test(flagOn), "product promotions tab missing")
await assert(!/\bскоро\b/i.test(flagOn), "stub «скоро» badge still present")
await assert(/Готовность карточки|Готовность:/i.test(flagOn), "readiness summary missing")
await assert(
  /Сохраняет только название, описание и статус/i.test(flagOn),
  "honest Save scope caption missing"
)
await assert(!/Флаг WOODRIGHT_ADMIN_UX_V1/i.test(flagOn), "flag jargon in workspace UI")

// 404 normalized
await page.goto(`${BASE}/app/woodright/products/prod_DOES_NOT_EXIST`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2500)
const missing = (await page.locator("body").innerText()).trim()
await assert(
  /Запись удалена|не существует|not found|404/i.test(missing),
  "missing product state not normalized"
)

await assert(pageErrors.length === 0, `unexpected pageerror: ${pageErrors.join(" | ")}`)

const result = {
  ok: true,
  base: BASE,
  pageErrors,
  consoleErrors: consoleErrors.slice(0, 20),
}
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2))
}
console.log(JSON.stringify(result, null, 2))
await browser.close()
process.exit(0)
