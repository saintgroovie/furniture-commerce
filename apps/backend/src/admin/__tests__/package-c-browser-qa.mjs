/**
 * Package C browser QA — variants tab + Package B regression smoke.
 * Requires Medusa on B6_BASE and Playwright (NODE_PATH=/tmp/b5-playwright-qa/node_modules).
 */
import { createRequire } from "module"
import fs from "fs"

const require = createRequire("/tmp/b5-playwright-qa/package.json")
const { chromium } = require("playwright")

const BASE = process.env.B6_BASE || "http://localhost:9001"
const STD = process.env.B6_PRODUCT_ID || "prod_01KX9PD26JVQJS4M811SPZZRDV"
const BESPOKE = "prod_01KX9PR0S4XQ2YZ1MCD3FG8W25"
const MISSING = "prod_01KX9PR14G92411WTRYWZAVNHJ"
const NOPRICE = "prod_01KX9PR19F5FKYX0TC1VK1BZE8"
const OUTDIR =
  process.env.B6_QA_OUTDIR ||
  "/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration/tmp/admin-ux-package-c-qa"
const OUT = process.env.B6_SMOKE_OUT || `${OUTDIR}/package-c-browser-qa.json`

fs.mkdirSync(OUTDIR, { recursive: true })

const pageErrors = []
const consoleErrors = []
const failed = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "1")
  window.__WOODRIGHT_ADMIN_UX_V1__ = "1"
})
const page = await context.newPage()
page.on("pageerror", (e) => pageErrors.push(e.message))
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text())
})
page.on("response", (r) => {
  if (r.status() >= 500) failed.push(`${r.url()} ${r.status()}`)
})

await page.goto(`${BASE}/app/login`, { waitUntil: "networkidle", timeout: 120000 })
await page.locator('input[name="email"], input[type="email"], input[type="text"]').first().fill("admin@woodright.ru")
await page.locator('input[name="password"], input[type="password"]').first().fill("admin123")
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(5000)
// Fallback: API session + common localStorage keys if UI stayed on login
const stillLogin =
  /Welcome to (Medusa|Woodright)|Добро пожаловать в Woodright/i.test(
    await page.locator("body").innerText()
  )
if (stillLogin) {
  const ok = await page.evaluate(async () => {
    const res = await fetch("/auth/user/emailpass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "admin@woodright.ru",
        password: "admin123",
      }),
    })
    const j = await res.json()
    if (!j.token) return false
    await fetch("/auth/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${j.token}`,
      },
      credentials: "include",
      body: JSON.stringify({ token: j.token }),
    })
    localStorage.setItem("medusa_auth_token", j.token)
    localStorage.setItem("token", j.token)
    return true
  })
  if (!ok) {
    console.error(JSON.stringify({ error: "login_failed" }))
    await browser.close()
    process.exit(1)
  }
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle", timeout: 120000 })
  await page.waitForTimeout(3000)
}

const scenarios = []
for (const w of [1440, 1280, 1024]) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.goto(`${BASE}/app/woodright/products/${STD}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })
  await page.waitForTimeout(2500)
  await page.getByRole("tab", { name: "Варианты и цены" }).click()
  await page.waitForTimeout(2000)
  const body = await page.locator("body").innerText()
  await page.screenshot({ path: `${OUTDIR}/variants-${w}.png`, fullPage: true })
  scenarios.push({
    viewport: w,
    ok:
      /Основной вариант/i.test(body) &&
      /Артикул/i.test(body) &&
      /Цена/i.test(body) &&
      /полной карточке/i.test(body) &&
      !/Полноценная матрица вариантов будет добавлена/i.test(body),
    sample: body.replace(/\s+/g, " ").slice(0, 350),
  })
}

await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/app/woodright/products/${STD}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2000)
const overview = await page.locator("body").innerText()
const bOk = /Обзор|Классификац|STANDARD|Стандарт/i.test(overview)

await page.goto(`${BASE}/app/woodright/products/${BESPOKE}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2000)
await page.getByRole("tab", { name: "Варианты и цены" }).click()
await page.waitForTimeout(1500)
const bespoke = await page.locator("body").innerText()

await page.goto(`${BASE}/app/woodright/products/${MISSING}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2000)
await page.getByRole("tab", { name: "Варианты и цены" }).click()
await page.waitForTimeout(1500)
const missing = await page.locator("body").innerText()

await page.goto(`${BASE}/app/woodright/products/${NOPRICE}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2000)
await page.getByRole("tab", { name: "Варианты и цены" }).click()
await page.waitForTimeout(1500)
const noprice = await page.locator("body").innerText()

// Flag off workspace
await context.addInitScript(() => {
  localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "0")
  window.__WOODRIGHT_ADMIN_UX_V1__ = "0"
})
await page.goto(`${BASE}/app/woodright/products/${STD}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2000)
const flagOff = await page.locator("body").innerText()

const result = {
  scenarios,
  packageBOverviewOk: bOk,
  bespokeWarn: /по запросу|заявк/i.test(bespoke),
  missingType: /не указан/i.test(missing),
  noPriceHint: /нет цены|без цены|Цена не|отсутств|требует внимания/i.test(noprice),
  flagOffDisabled: /выключена|flag|отключен/i.test(flagOff),
  pageErrors,
  consoleErrors: consoleErrors.slice(0, 30),
  failed: failed.slice(0, 30),
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
await browser.close()

const ok =
  result.scenarios.every((s) => s.ok) &&
  result.packageBOverviewOk &&
  result.bespokeWarn &&
  result.missingType &&
  result.noPriceHint &&
  pageErrors.length === 0
process.exit(ok ? 0 : 1)
