/**
 * Read-only storefront smoke for the copy pass: verifies where product
 * texts render today (PDP description block, meta description, card),
 * on products of different classes/collections — WITHOUT applying any
 * new texts. Requires storefront :3002 + backend :9000 already running.
 * Run: node docs/product-copy/scripts/smoke-current-rendering.mjs
 */
import { chromium } from "playwright"

const HANDLES = [
  // STANDARD with stub description
  "greenwich-gr-05-1",
  "greenwich-gr-16-1",
  "greenwich-gr-09-1-mirror",
  // CONFIGURABLE without description (adult)
  "ol-17-3",
  "ol-05-1",
  "pv-15-2",
  // kids / Willie Winkie (request mode)
  "av-05-1",
  "mo-81-1",
  "ol-85-1",
]

const API = process.env.MEDUSA_API ?? "http://localhost:9000"

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env var ${name} (local dev admin credentials; never commit values)`)
  return v
}

const login = await fetch(`${API}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: requireEnv("MEDUSA_ADMIN_EMAIL"),
    password: requireEnv("MEDUSA_ADMIN_PASSWORD"),
  }),
})
const { token } = await login.json()
const idByHandle = new Map()
const res = await fetch(`${API}/admin/products?limit=200&fields=id,handle`, {
  headers: { authorization: `Bearer ${token}` },
})
for (const p of (await res.json()).products) idByHandle.set(p.handle, p.id)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

for (const handle of HANDLES) {
  const id = idByHandle.get(handle)
  if (!id) {
    console.log(`${handle}: NOT FOUND in admin list`)
    continue
  }
  await page.goto(`http://localhost:3002/product/${id}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("h1", { timeout: 15000 })
  const data = await page.evaluate(() => {
    const desc = document.querySelector(".pdp-description")
    const meta = document.querySelector('meta[name="description"]')
    const h1 = document.querySelector("h1")
    return {
      title: h1?.textContent?.trim() ?? null,
      hasDescriptionBlock: !!desc,
      descriptionText: desc?.textContent?.trim().slice(0, 80) ?? null,
      metaDescription: meta?.getAttribute("content")?.slice(0, 80) ?? null,
    }
  })
  console.log(handle, JSON.stringify(data))
}

// mobile spot check on one PDP
const mob = await browser.newPage({ viewport: { width: 390, height: 800 } })
await mob.goto(`http://localhost:3002/product/${idByHandle.get("greenwich-gr-05-1")}`, { waitUntil: "domcontentloaded" })
const mobOk = await mob.evaluate(() => {
  const el = document.querySelector(".pdp-description")
  if (!el) return { present: false }
  const r = el.getBoundingClientRect()
  return { present: true, fitsViewportWidth: r.width <= innerWidth }
})
console.log("mobile pdp-description:", JSON.stringify(mobOk))

await browser.close()
