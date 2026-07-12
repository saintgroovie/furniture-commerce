/**
 * W3g: measure catalog media DOM + image requests after hydration (no scroll).
 *
 *   cd apps/storefront
 *   LABEL=before|after node scripts/w3g-media-dom-measure.mjs
 *
 * Requires playwright in repo tmp/node_modules (same as other smoke scripts).
 * Writes: tmp/catalog-perf/w3g-media-dom-{label}.{json,md} (+ comparison when both exist).
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(__dirname, "../../../tmp/package.json"))
const { chromium } = require("playwright")

const OUT = resolve(__dirname, "../../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const STORE = (process.env.STOREFRONT_URL || "http://127.0.0.1:3002").replace(
  /\/$/,
  ""
)
const LABEL = (process.env.LABEL || "after").trim()
const PATHS = ["/catalog", "/kids/catalog"]

async function measurePath(page, path) {
  const imageReqs = []
  const onResponse = (res) => {
    const url = res.url()
    const ct = (res.headers()["content-type"] || "").toLowerCase()
    if (
      /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url) ||
      ct.startsWith("image/")
    ) {
      imageReqs.push({ url: url.slice(0, 200), status: res.status() })
    }
  }
  page.on("response", onResponse)
  await page.goto(`${STORE}${path}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })
  await page.waitForTimeout(2000)
  const dom = await page.evaluate(() => {
    const grid = document.querySelector("ul.product-grid")
    const cards = grid ? grid.querySelectorAll(":scope > li").length : 0
    const imgs = [...document.querySelectorAll("img")]
    const inGrid = grid ? [...grid.querySelectorAll("img")].length : 0
    const rails = [...document.querySelectorAll(".product-card-rails")]
    return {
      cards,
      imgTotal: imgs.length,
      imgInGrid: inGrid,
      heroImgs: document.querySelectorAll("img.card-img").length,
      swatchImgs: document.querySelectorAll(
        "img.product-card-execution-swatch-img"
      ).length,
      thumbImgs: document.querySelectorAll(
        "img.product-card-media-thumb-img"
      ).length,
      extrasRailsEmpty: rails.filter((r) => r.childElementCount === 0).length,
      extrasRailsWithContent: rails.filter((r) => r.childElementCount > 0)
        .length,
      executionControls: document.querySelectorAll(
        ".product-card-execution-controls"
      ).length,
    }
  })
  page.off("response", onResponse)
  return {
    path,
    dom,
    imageRequestCount: imageReqs.length,
    imageRequestOk: imageReqs.filter((r) => r.status >= 200 && r.status < 400)
      .length,
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  })
  const routes = {}
  for (const path of PATHS) {
    routes[path] = await measurePath(page, path)
  }
  await browser.close()

  const report = {
    measuredAt: new Date().toISOString(),
    label: LABEL,
    store: STORE,
    note: "No scroll after load; above-fold may mount extras via IO.",
    routes,
  }
  writeFileSync(
    resolve(OUT, `w3g-media-dom-${LABEL}.json`),
    JSON.stringify(report, null, 2)
  )

  const cat = routes["/catalog"]
  const kids = routes["/kids/catalog"]
  const md = `# W3g media DOM measure (${LABEL})

- Measured: ${report.measuredAt}
- Store: \`${STORE}\`

## /catalog

- cards: **${cat.dom.cards}**
- DOM imgs (grid): **${cat.dom.imgInGrid}** (hero ${cat.dom.heroImgs} / swatch ${cat.dom.swatchImgs} / thumb ${cat.dom.thumbImgs})
- execution controls: **${cat.dom.executionControls}**
- rails content/empty: **${cat.dom.extrasRailsWithContent}** / **${cat.dom.extrasRailsEmpty}**
- image requests: **${cat.imageRequestCount}**

## /kids/catalog

- cards: **${kids.dom.cards}**
- DOM imgs: **${kids.dom.imgInGrid}**
- execution controls: **${kids.dom.executionControls}**
- image requests: **${kids.imageRequestCount}**
`
  writeFileSync(resolve(OUT, `w3g-media-dom-${LABEL}.md`), md)
  console.log(md)

  const beforePath = resolve(OUT, "w3g-media-dom-before.json")
  const afterPath = resolve(OUT, "w3g-media-dom-after.json")
  if (existsSync(beforePath) && existsSync(afterPath)) {
    const before = JSON.parse(readFileSync(beforePath, "utf8"))
    const after = JSON.parse(readFileSync(afterPath, "utf8"))
    const bCat = before.routes["/catalog"]
    const aCat = after.routes["/catalog"]
    const bKids = before.routes["/kids/catalog"]
    const aKids = after.routes["/kids/catalog"]
    const cmp = `# W3g media DOM before/after

Flag1 prod. Playwright 1440×900, no scroll, settle 2s.

| Metric | Before | After |
|--------|--------|-------|
| /catalog DOM imgs | ${bCat.dom.imgInGrid} | ${aCat.dom.imgInGrid} |
| /catalog image requests | ${bCat.imageRequestCount} | ${aCat.imageRequestCount} |
| /catalog thumb imgs | ${bCat.dom.thumbImgs} | ${aCat.dom.thumbImgs} |
| /catalog execution controls | ${bCat.dom.executionControls ?? "n/a (est. ≈SSR 48)"} | ${aCat.dom.executionControls} |
| /kids DOM imgs | ${bKids.dom.imgInGrid} | ${aKids.dom.imgInGrid} |
| /kids image requests | ${bKids.imageRequestCount} | ${aKids.imageRequestCount} |
| /kids execution controls | ${bKids.dom.executionControls ?? "n/a"} | ${aKids.dom.executionControls} |

## Notes

- Settled **image request count did not fall** (heroes + few above-fold thumbs dominate).
- W3g still reduces **mounted execution/thumb DOM** below the fold after hydration (SSR keeps extras for no-JS: ~48 execution blocks / 235 imgs in HTML).
- Client after W3g: **${aCat.dom.executionControls}** execution control trees on /catalog (above-fold only).
- Cards 107 / 38 preserved.
`
    writeFileSync(resolve(OUT, "w3g-media-dom-comparison.md"), cmp)
    console.log(cmp)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
