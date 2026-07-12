/**
 * Package D gallery browser smoke + light ABC regression.
 * B6_BASE=http://localhost:9001 NODE_PATH=/tmp/b5-playwright-qa/node_modules
 */
import { createRequire } from "module"
import fs from "fs"

const require = createRequire("/tmp/b5-playwright-qa/package.json")
const { chromium } = require("playwright")

const BASE = process.env.B6_BASE || "http://localhost:9001"
const STD = "prod_01KX9PD26JVQJS4M811SPZZRDV"
const LARGE = "prod_01KX9PR1TFV6QCYEQ0V8T1A34Y"
const OUTDIR =
  process.env.B6_QA_OUTDIR ||
  "/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration/tmp/admin-ux-package-d"
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
await page.locator('input[name="email"], input[type="text"]').first().fill("admin@woodright.ru")
await page.locator('input[name="password"], input[type="password"]').first().fill("admin123")
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(4000)

const scenarios = []
for (const w of [1440, 1280, 1024]) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.goto(`${BASE}/app/woodright/products/${STD}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })
  await page.waitForTimeout(2000)
  await page.getByRole("tab", { name: "Галерея" }).click()
  await page.waitForTimeout(2000)
  const body = await page.locator("body").innerText()
  await page.screenshot({ path: `${OUTDIR}/gallery-${w}.png`, fullPage: true })
  scenarios.push({
    viewport: w,
    ok:
      /Галерея/i.test(body) &&
      /полной карточке/i.test(body) &&
      !/будет добавлено в Package D/i.test(body),
    sample: body.replace(/\s+/g, " ").slice(0, 350),
  })
}

await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/app/woodright/products/${LARGE}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(2500)
await page.getByRole("tab", { name: "Галерея" }).click()
await page.waitForTimeout(3000)
const largeBody = await page.locator("body").innerText()
await page.screenshot({ path: `${OUTDIR}/gallery-96.png`, fullPage: true })

// Package C tab still present
await page.goto(`${BASE}/app/woodright/products/${STD}`, {
  waitUntil: "networkidle",
  timeout: 120000,
})
await page.waitForTimeout(1500)
await page.getByRole("tab", { name: "Варианты и цены" }).click()
await page.waitForTimeout(1500)
const variants = await page.locator("body").innerText()

const result = {
  scenarios,
  largeOk: /96|Изображений:\s*96/i.test(largeBody),
  variantsOk:
    /Артикул/i.test(variants) && /полной карточке/i.test(variants),
  pageErrors,
  consoleErrors: consoleErrors.slice(0, 25),
  failed: failed.slice(0, 25),
}
fs.writeFileSync(`${OUTDIR}/package-d-browser-qa.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
await browser.close()
const ok =
  result.scenarios.every((s) => s.ok) &&
  result.largeOk &&
  result.variantsOk &&
  pageErrors.length === 0
process.exit(ok ? 0 : 1)
