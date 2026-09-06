/**
 * Post-apply storefront smoke for product-copy editorial pass.
 * Checks PDP description + meta across collections/classes and viewports.
 * Does NOT modify storefront. Requires :3002 + :9000.
 *
 * Run: MEDUSA_ADMIN_EMAIL=… MEDUSA_ADMIN_PASSWORD=… \
 *   node docs/product-copy/scripts/smoke-postapply-rendering.mjs
 */
import { writeFile, mkdir, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    path.resolve("tmp/node_modules/playwright/index.mjs"),
    path.resolve("/Users/leonidmbp/Documents/projects/furniture-commerce/tmp/node_modules/playwright/index.mjs"),
    path.resolve("apps/storefront/node_modules/playwright/index.mjs"),
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      await access(c)
      return await import(pathToFileURL(c).href)
    } catch {
      /* try next */
    }
  }
  return await import("playwright")
}
const { chromium } = await loadPlaywright()
if (!chromium?.launch) throw new Error("playwright chromium.launch unavailable")

const API = process.env.MEDUSA_API ?? "http://127.0.0.1:9000"
const STORE = process.env.STOREFRONT_URL ?? "http://localhost:3002"
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, "..", "apply", "reports")

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env var ${name}`)
  return v
}

const CASES = [
  // 3 STANDARD
  { handle: "greenwich-gr-05-1", kind: "STANDARD", collection: "Greenwich" },
  { handle: "greenwich-gr-16-1", kind: "STANDARD", collection: "Greenwich" },
  { handle: "greenwich-gr-09-1-mirror", kind: "STANDARD", collection: "Greenwich" },
  // 3 CONFIGURABLE adult
  { handle: "ol-17-3", kind: "CONFIGURABLE", collection: "Oliver" },
  { handle: "ol-05-1", kind: "CONFIGURABLE", collection: "Oliver" },
  { handle: "pv-15-2", kind: "CONFIGURABLE", collection: "Provence" },
  // 3 Kids
  { handle: "av-05-1", kind: "Kids", collection: "Willie Winkie" },
  { handle: "mo-81-1", kind: "Kids", collection: "Molly" },
  { handle: "ol-85-1", kind: "Kids", collection: "Oliver Kids" },
  // collections coverage
  { handle: "co-15-2", kind: "CONFIGURABLE", collection: "Country" },
  { handle: "ox-90-1", kind: "CONFIGURABLE", collection: "Oxford", expectNormalizedTitle: true },
  // short / long description
  { handle: "greenwich-gr-26-1", kind: "STANDARD", collection: "Greenwich", note: "longer desc sample" },
  { handle: "ol-69-1", kind: "CONFIGURABLE", collection: "Oliver", note: "shorter desc sample" },
  // specials
  { handle: "s-ox-05", kind: "SPECIAL", collection: "Oxford", expectEmptyDescription: true, expectNormalizedTitle: true },
  { handle: "ol-08-1", kind: "SPECIAL", collection: "Oliver", expectUnchangedEmptyDesc: true },
  { handle: "ol-08-1-mirror", kind: "SPECIAL", collection: "Oliver", expectUnchangedEmptyDesc: true },
]

const login = await fetch(`${API}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: requireEnv("MEDUSA_ADMIN_EMAIL"),
    password: requireEnv("MEDUSA_ADMIN_PASSWORD"),
  }),
})
if (!login.ok) throw new Error(`login failed ${login.status}`)
const { token } = await login.json()
const headers = { authorization: `Bearer ${token}` }

const idByHandle = new Map()
const textByHandle = new Map()
const res = await fetch(`${API}/admin/products?limit=200&fields=id,handle,title,subtitle,description`, { headers })
for (const p of (await res.json()).products) {
  idByHandle.set(p.handle, p.id)
  textByHandle.set(p.handle, {
    title: p.title,
    subtitle: p.subtitle ?? "",
    description: p.description ?? "",
  })
}

async function inspect(page, handle) {
  const id = idByHandle.get(handle)
  if (!id) return { handle, error: "NOT_FOUND" }
  const consoleErrors = []
  const pageErrors = []
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200))
  }
  const onPageError = (err) => pageErrors.push(String(err).slice(0, 200))
  page.on("console", onConsole)
  page.on("pageerror", onPageError)
  await page.goto(`${STORE}/product/${id}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForSelector("h1", { timeout: 20000 })
  const data = await page.evaluate(() => {
    const desc = document.querySelector(".pdp-description")
    const meta = document.querySelector('meta[name="description"]')
    const h1 = document.querySelector("h1")
    const html = document.documentElement.outerHTML
    const bodyText = document.body?.innerText ?? ""
    return {
      title: h1?.textContent?.trim() ?? null,
      hasDescriptionBlock: !!desc,
      descriptionText: desc?.textContent?.trim() ?? null,
      metaDescription: meta?.getAttribute("content") ?? null,
      hasObjectObject: html.includes("[object Object]") || bodyText.includes("[object Object]"),
      hasBrokenEntity: /&[a-zA-Z0-9]+(?![a-zA-Z0-9];)/.test(desc?.textContent ?? "") === false
        ? false
        : /&(?:amp|lt|gt|nbsp|quot|#\d+);?/.test(desc?.innerHTML ?? ""),
      looksLikeMarkdown: /(^|\n)\s{0,3}#{1,6}\s|(^|\n)\s*[-*]\s+\S|\*\*[^*]+\*\*/.test(desc?.textContent ?? ""),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })
  page.off("console", onConsole)
  page.off("pageerror", onPageError)
  const api = textByHandle.get(handle)
  const subtitleRendered = await page.evaluate((sub) => {
    if (!sub) return false
    const body = document.body?.innerText ?? ""
    return body.includes(sub)
  }, api?.subtitle ?? "")
  return {
    handle,
    id,
    api,
    ...data,
    subtitleRenderedInDom: subtitleRendered,
    consoleErrors: consoleErrors.slice(0, 5),
    pageErrors: pageErrors.slice(0, 5),
  }
}

const browser = await chromium.launch()
const results = []

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 800 },
]) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
  for (const c of CASES) {
    const r = await inspect(page, c.handle)
    const api = r.api
    const checks = {
      descriptionVisibleIfExpected:
        c.expectEmptyDescription || c.expectUnchangedEmptyDesc
          ? !r.hasDescriptionBlock || !(r.descriptionText || "").trim()
          : r.hasDescriptionBlock && !!(r.descriptionText || "").trim(),
      metaUpdatedIfHasDesc:
        c.expectEmptyDescription || c.expectUnchangedEmptyDesc
          ? true
          : !!(r.metaDescription && api?.description && r.metaDescription.includes(api.description.slice(0, 40))),
      titleNormalized: c.expectNormalizedTitle ? r.title === api?.title : true,
      noObjectObject: !r.hasObjectObject,
      noOverflow: !r.overflowX,
      noPageErrors: (r.pageErrors?.length ?? 0) === 0,
      subtitleNotRendered: r.subtitleRenderedInDom === false || !(api?.subtitle),
    }
    results.push({ viewport: viewport.name, ...c, ...r, checks })
    console.log(
      `${viewport.name} ${c.handle}: desc=${checks.descriptionVisibleIfExpected} meta=${checks.metaUpdatedIfHasDesc} overflow=${r.overflowX} obj=${r.hasObjectObject}`
    )
  }
  await page.close()
}

await browser.close()

const failed = results.filter((r) => Object.values(r.checks || {}).some((v) => v === false))
const summary = {
  at: new Date().toISOString(),
  cases: CASES.length,
  viewports: 2,
  total_inspections: results.length,
  failed_checks: failed.length,
  note_subtitle: "subtitle is stored in API but not rendered by storefront (known; out of scope)",
  failed: failed.map((f) => ({
    viewport: f.viewport,
    handle: f.handle,
    checks: f.checks,
    descriptionText: f.descriptionText?.slice(0, 80),
    metaDescription: f.metaDescription?.slice(0, 80),
    consoleErrors: f.consoleErrors,
    pageErrors: f.pageErrors,
  })),
}

await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, "product-copy-storefront-smoke.json"), JSON.stringify({ summary, results }, null, 2))
console.log(JSON.stringify(summary, null, 2))
if (failed.length) process.exit(2)
