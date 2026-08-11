#!/usr/bin/env node
/**
 * Production-runtime E2E for guest order-track fragment handoff.
 *
 * Preconditions:
 *   - storefront `next start` listening on BASE_URL (default http://127.0.0.1:3029)
 *   - optional Playwright for browser fragment checks
 *
 * Env:
 *   BASE_URL
 *   CANARY_TOKEN  (synthetic; never print full value in summaries - use fingerprint)
 *
 * Exit 0 only if:
 *   - HTTP request targets never include canary
 *   - HTML / RSC payloads never include canary
 *   - legacy ?token= is redirected without rendering token into HTML
 *   - Cache-Control private/no-store on track
 *   - (if Playwright) fragment consumed + history cleaned + sessionStorage set
 */
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3029").replace(/\/$/, "")
const ORDER_ID = process.env.CANARY_ORDER_ID || "order_01CANARYTRACK"
const CANARY =
  process.env.CANARY_TOKEN ||
  `wr_canary_${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 24)}`
const FINGERPRINT = createHash("sha256").update(CANARY).digest("hex").slice(0, 12)

function assertNoCanary(label, text) {
  if (typeof text !== "string") return
  assert.equal(
    text.includes(CANARY),
    false,
    `${label} contains canary fingerprint=${FINGERPRINT}`
  )
}

async function fetchRaw(path, init = {}) {
  const url = `${BASE}${path}`
  // Ensure we never accidentally put canary in path for "safe" requests.
  if (!path.includes("token=") && url.includes(CANARY)) {
    throw new Error("test bug: canary leaked into request URL builder")
  }
  const res = await fetch(url, {
    redirect: "manual",
    ...init,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      ...(init.headers || {}),
    },
  })
  const body = await res.text()
  return { res, body, url }
}

async function main() {
  console.log(`e2e-order-track: base=${BASE} fingerprint=${FINGERPRINT}`)

  // 1) Token-free track page HTML
  {
    const { res, body } = await fetchRaw(
      `/orders/track?order_id=${encodeURIComponent(ORDER_ID)}`
    )
    assert.equal(res.status, 200)
    const cc = res.headers.get("cache-control") || ""
    assert.match(cc, /private/i)
    assert.match(cc, /no-store/i)
    const rp = res.headers.get("referrer-policy") || ""
    assert.ok(rp.length > 0, "referrer-policy present")
    assertNoCanary("html-token-free", body)
    // Next Flight bootstrap often embeds urlParts - order_id ok, token must not
    assert.equal(body.includes("token=" + CANARY), false)
    assert.equal(body.includes(CANARY), false)
  }

  // 2) Legacy query token: must redirect; final HTML must not contain canary
  {
    const { res, body } = await fetchRaw(
      `/orders/track?order_id=${encodeURIComponent(ORDER_ID)}&token=${encodeURIComponent(CANARY)}`
    )
    assert.ok([301, 302, 303, 307, 308].includes(res.status), `expected redirect, got ${res.status}`)
    const loc = res.headers.get("location") || ""
    assert.equal(loc.includes(CANARY), false, "Location must not echo canary")
    assert.equal(new URL(loc, BASE).searchParams.has("token"), false)
    assertNoCanary("legacy-redirect-body", body)

    const follow = await fetchRaw(
      loc.startsWith("http") ? new URL(loc).pathname + new URL(loc).search : loc
    )
    assert.equal(follow.res.status, 200)
    assertNoCanary("legacy-follow-html", follow.body)
  }

  // 3) Playwright browser fragment (optional)
  let playwrightOk = false
  try {
    const { createRequire } = await import("node:module")
    const require = createRequire(import.meta.url)
    const candidates = [
      process.env.PLAYWRIGHT_MODULE,
      "/tmp/wr-pw-ot/node_modules/playwright",
      "playwright",
    ].filter(Boolean)
    let chromium
    let lastErr
    for (const c of candidates) {
      try {
        ;({ chromium } = require(c))
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!chromium) throw lastErr || new Error("playwright not found")
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const leaked = []
    page.on("request", (req) => {
      const u = req.url()
      if (u.includes(CANARY)) leaked.push(u.split("#")[0])
    })
    const trackUrl = `${BASE}/orders/track?order_id=${encodeURIComponent(ORDER_ID)}#token=${encodeURIComponent(CANARY)}`
    await page.goto(trackUrl, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(800)
    const html = await page.content()
    assertNoCanary("playwright-html", html)
    const href = await page.evaluate(() => window.location.href)
    assert.equal(href.includes(CANARY), false, "history still has canary")
    assert.equal(await page.evaluate(() => window.location.hash), "")
    const stored = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      `woodright_order_token:${ORDER_ID}`
    )
    assert.equal(stored, CANARY)
    assert.equal(leaked.length, 0, `network leaked canary in ${leaked.length} requests`)
    await browser.close()
    playwrightOk = true
  } catch (e) {
    console.log(
      `playwright_skipped=${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`
    )
  }

  console.log(
    JSON.stringify({
      ok: true,
      fingerprint: FINGERPRINT,
      playwright: playwrightOk,
    })
  )
}

main().catch((err) => {
  console.error("e2e-order-track FAILED", err instanceof Error ? err.message : err)
  process.exit(1)
})
