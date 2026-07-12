/**
 * Package C DOM smoke — variants tab basics.
 * Requires Medusa on B6_BASE and Playwright.
 */
import { chromium } from "playwright"
import fs from "fs"

const BASE = process.env.B6_BASE || "http://localhost:9001"
const STD = process.env.B6_PRODUCT_ID || "prod_01KX9PD26JVQJS4M811SPZZRDV"
const OUT = process.env.B6_SMOKE_OUT || ""

const pageErrors = []
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "1")
})
const page = await context.newPage()
page.on("pageerror", (e) => pageErrors.push(e.message))

await page.goto(`${BASE}/app/login`, { waitUntil: "networkidle", timeout: 120000 })
await page.locator('input[name="email"], input[type="email"]').first().fill("admin@woodright.ru")
await page.locator('input[name="password"], input[type="password"]').first().fill("admin123")
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(4000)

await page.goto(`${BASE}/app/woodright/products/${STD}`, { waitUntil: "networkidle", timeout: 120000 })
await page.waitForTimeout(3000)
await page.getByRole("tab", { name: "Варианты и цены" }).click()
await page.waitForTimeout(2000)
const body = await page.locator("body").innerText()
const ok =
  /Основной вариант|Вариант|SKU|Цена/i.test(body) &&
  !/Полноценная матрица вариантов будет добавлена/i.test(body)

const result = { ok, pageErrors, sample: body.replace(/\s+/g, " ").slice(0, 400) }
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
await browser.close()
process.exit(ok && pageErrors.length === 0 ? 0 : 1)
