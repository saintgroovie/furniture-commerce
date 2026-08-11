#!/usr/bin/env node
/**
 * Read-only public catalog verifier (buyer-visible).
 * Does not mutate data. Optional Playwright when available.
 *
 * Usage:
 *   node scripts/release/verify-public-catalog.mjs --base https://woodright-demo.ru --out /tmp/report.json
 *   node scripts/release/verify-public-catalog.mjs --base https://woodright-demo.ru --samples 5
 */
const fs = require("fs")
const { spawnSync } = require("child_process")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

const base = (arg("--base", "https://woodright-demo.ru") || "").replace(/\/$/, "")
const outPath = arg("--out", "")
const allowShort = process.argv.includes("--allow-short-samples")
let samplesN = Number(arg("--samples", "5")) || 5
if (!allowShort && samplesN < 5) {
  console.error("samples must be >= 5 (or pass --allow-short-samples for local debug)")
  process.exit(2)
}
const timeoutMs = Number(arg("--timeout", "90000")) || 90000

async function loadPlaywright() {
  const candidates = [
    process.env.WOODRIGHT_PLAYWRIGHT_PATH,
    "/Users/leonidmbp/Documents/projects/furniture-commerce/tmp/node_modules/playwright",
    pathJoin(process.cwd(), "tmp/node_modules/playwright"),
    "playwright",
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(c)
    } catch {
      /* try next */
    }
  }
  return null
}

function pathJoin(...parts) {
  return parts.join("/").replace(/\/+/g, "/")
}

async function cardOrder(page, n = 30) {
  return page.evaluate((n) => {
    return [...document.querySelectorAll(".product-card")]
      .slice(0, n)
      .map((el, i) => ({
        i: i + 1,
        title: (el.querySelector("h3")?.textContent || "").trim(),
        href: el.querySelector("a[href*='/product/']")?.getAttribute("href") || "",
      }))
  }, n)
}

function isAccessoryTitle(t) {
  return /зеркал|час(ы|ов)|mirror|clock|декор/i.test(t || "")
}

async function main() {
  const pw = await loadPlaywright()
  if (!pw) {
    console.error("playwright not found — set WOODRIGHT_PLAYWRIGHT_PATH or install tmp/node_modules/playwright")
    process.exit(2)
  }
  const { chromium } = pw
  const chrome =
    process.env.WOODRIGHT_CHROME ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chrome) ? chrome : undefined,
  })
  const report = {
    base,
    started_at: new Date().toISOString(),
    results: {},
    samples: [],
    ok: true,
    errors: [],
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const gotoCards = async (url) => {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    await page.waitForSelector(".product-card h3", { timeout: timeoutMs })
    await page.waitForTimeout(600)
    return resp
  }

  try {
    let r = await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    report.results.home = { status: r?.status() }

    r = await gotoCards(`${base}/catalog`)
    const catalog = await cardOrder(page)
    const mirror = catalog.findIndex((c) => /зеркал|mirror/i.test(c.title))
    report.results.catalog = {
      status: r?.status(),
      first: catalog[0],
      mirror_idx0: mirror,
      furniture_first: catalog[0] && !isAccessoryTitle(catalog[0].title),
      count: await page.locator(".product-card").count(),
    }
    if (!report.results.catalog.furniture_first) {
      report.ok = false
      report.errors.push("catalog first card is accessory")
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs })
    await page.waitForSelector(".product-card h3", { timeout: timeoutMs })
    const reload = await cardOrder(page)
    report.results.reload_same = reload[0]?.href === catalog[0]?.href
    if (!report.results.reload_same) {
      report.ok = false
      report.errors.push("reload first card differs from initial merchandising first card")
    }
    if (report.results.catalog.mirror_idx0 < 0) {
      report.errors.push("mirror not found in first 30 cards (informational)")
    } else if (report.results.catalog.mirror_idx0 === 0) {
      report.ok = false
      report.errors.push("mirror is first DOM card")
    }

    await gotoCards(`${base}/catalog?sort=bogus`)
    const bogus = await cardOrder(page)
    report.results.invalid_matches_default = bogus[0]?.href === catalog[0]?.href
    if (!report.results.invalid_matches_default) {
      report.ok = false
      report.errors.push("invalid sort did not return merchandising first card")
    }

    await gotoCards(`${base}/catalog?sort=price_asc`)
    report.results.price_asc_first = (await cardOrder(page))[0]
    await gotoCards(`${base}/catalog?sort=price_desc`)
    report.results.price_desc_first = (await cardOrder(page))[0]
    if (report.results.price_asc_first?.href === report.results.price_desc_first?.href) {
      report.ok = false
      report.errors.push("price_asc and price_desc first card identical")
    }

    await gotoCards(`${base}/kids/catalog`)
    const kids = await cardOrder(page, 15)
    report.results.kids = {
      first: kids[0],
      furniture_first: kids[0] && !isAccessoryTitle(kids[0].title),
    }
    if (!report.results.kids.furniture_first) {
      report.ok = false
      report.errors.push("kids catalog first card is accessory")
    }

    for (let i = 1; i <= samplesN; i++) {
      const t0 = new Date().toISOString()
      const resp = await gotoCards(`${base}/catalog`)
      const cards = await cardOrder(page, 20)
      const sample = {
        i,
        ts: t0,
        status: resp?.status(),
        first: cards[0],
        mirror_idx0: cards.findIndex((c) => /зеркал|mirror/i.test(c.title)),
      }
      report.samples.push(sample)
      if (i < samplesN) await page.waitForTimeout(2500)
    }
    const s0 = report.samples[0]
    const stable = report.samples.every(
      (s) =>
        s.status === 200 &&
        s.first?.href === s0.first?.href &&
        s.mirror_idx0 === s0.mirror_idx0
    )
    report.results.samples_stable = stable
    if (!stable) {
      report.ok = false
      report.errors.push("race samples not stable")
    }
  } catch (e) {
    report.ok = false
    report.errors.push(String(e && e.message ? e.message : e))
  } finally {
    await browser.close()
  }

  report.finished_at = new Date().toISOString()
  const json = JSON.stringify(report, null, 2)
  if (outPath) fs.writeFileSync(outPath, json)
  console.log(json)
  process.exit(report.ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
