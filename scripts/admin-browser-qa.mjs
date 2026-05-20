#!/usr/bin/env node
/**
 * Browser QA for Medusa Admin (Playwright).
 * Lives under repo /scripts so Medusa dev watcher (apps/backend) does not restart on every edit.
 *
 * Evidence: apps/backend/.run/admin-browser-qa/ (gitignored)
 *
 * From apps/backend:
 *   npx playwright install chromium   # once per machine
 *   yarn admin-qa:browser
 *
 * Optional login:
 *   ADMIN_QA_EMAIL=... ADMIN_QA_PASSWORD=... yarn admin-qa:browser
 *
 * Optional target product (after login):
 *   ADMIN_QA_PRODUCT_ID=prod_... yarn admin-qa:browser
 *
 * Docker / other host:
 *   ADMIN_BASE_URL=http://localhost:9000 yarn admin-qa:browser
 */
import { createRequire } from "node:module"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, "..")
const backendRoot = path.join(repoRoot, "apps", "backend")
const outDir = path.join(backendRoot, ".run", "admin-browser-qa")
const baseUrl = (process.env.ADMIN_BASE_URL || "http://localhost:9001").replace(/\/$/, "")

const require = createRequire(path.join(backendRoot, "package.json"))
const { chromium } = require("playwright")

/** @type {{ url: string, method: string, status: number, ok: boolean, resourceType: string }[]} */
const networkByPhase = {
  productsList: [],
  productDetail: [],
}

/** @type {'productsList' | 'productDetail' | null} */
let activeNetworkPhase = null

function resetNetworkPhase(phase) {
  if (phase === "productsList") networkByPhase.productsList = []
  if (phase === "productDetail") networkByPhase.productDetail = []
}

function recordMediaResponse(res) {
  if (!activeNetworkPhase) return
  const url = res.url()
  let pathname = ""
  try {
    pathname = new URL(url).pathname
  } catch {
    return
  }
  if (!pathname.startsWith("/uploads/") && !pathname.startsWith("/static/")) {
    return
  }
  const row = {
    url,
    method: res.request().method(),
    status: res.status(),
    ok: res.ok(),
    resourceType: res.request().resourceType(),
  }
  networkByPhase[activeNetworkPhase].push(row)
}

const LOGIN_WAIT_MS = 30000
const EMAIL_SEL = 'input[type="email"], input[name="email"], input#email'
const PASS_SEL = 'input[type="password"], input[name="password"], input#password'

function isAppShellPath(pathname) {
  return pathname.startsWith("/app") && !pathname.includes("/login")
}

async function isLoginFormVisible(page) {
  const user = page.locator(EMAIL_SEL).first()
  const pass = page.locator(PASS_SEL).first()
  try {
    return (await user.isVisible()) && (await pass.isVisible())
  } catch {
    return false
  }
}

/**
 * After /app/login goto: wait for login form or authenticated app shell.
 * @returns {{ ok: true, mode: string } | { ok: false, reason: string }}
 */
async function ensureAdminSession(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/app/login`, { waitUntil: "domcontentloaded", timeout: 90000 })

  let pathname = new URL(page.url()).pathname
  if (isAppShellPath(pathname) && !(await isLoginFormVisible(page))) {
    return { ok: true, mode: "already_logged_in" }
  }

  const deadline = Date.now() + LOGIN_WAIT_MS
  let outcome = "timeout"
  while (Date.now() < deadline) {
    pathname = new URL(page.url()).pathname
    if (isAppShellPath(pathname) && !(await isLoginFormVisible(page))) {
      outcome = "app_shell"
      break
    }
    if (await isLoginFormVisible(page)) {
      outcome = "login_form"
      break
    }
    await page.waitForTimeout(200)
  }

  pathname = new URL(page.url()).pathname
  if (outcome === "app_shell" || (isAppShellPath(pathname) && !(await isLoginFormVisible(page)))) {
    return { ok: true, mode: "already_logged_in" }
  }

  if (outcome === "login_form" || (await isLoginFormVisible(page))) {
    const user = page.locator(EMAIL_SEL).first()
    const pass = page.locator(PASS_SEL).first()
    await user.fill(email)
    await pass.fill(password)
    const submit = page
      .locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")')
      .first()
    await submit.click()

    try {
      await page.waitForURL((url) => isAppShellPath(url.pathname), { timeout: LOGIN_WAIT_MS })
    } catch {
      /* fall through to post-submit check */
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {})
    await page.waitForTimeout(1500)

    pathname = new URL(page.url()).pathname
    if (isAppShellPath(pathname) && !(await isLoginFormVisible(page))) {
      return { ok: true, mode: "logged_in" }
    }
    return {
      ok: false,
      reason: `login submit did not reach app shell (url=${page.url()})`,
    }
  }

  return {
    ok: false,
    reason: `neither app shell nor login form after ${LOGIN_WAIT_MS}ms (url=${page.url()})`,
  }
}

function isUploadsPathname(pathname) {
  return pathname.startsWith("/uploads/")
}

function uploadsPathnameFromUrl(url) {
  try {
    return new URL(url).pathname
  } catch {
    return url.includes("/uploads/") ? url : ""
  }
}

function isBlockingUploadsResponse(row) {
  const pathname = uploadsPathnameFromUrl(row.url)
  if (!isUploadsPathname(pathname)) return false
  return !row.ok || row.status >= 400
}

function summarizeNetworkArray(arr) {
  const uploads = arr.filter((r) => isUploadsPathname(uploadsPathnameFromUrl(r.url)))
  const statics = arr.filter((r) => {
    try {
      return new URL(r.url).pathname.startsWith("/static/")
    } catch {
      return r.url.includes("/static/")
    }
  })
  const badUploads = uploads.filter(isBlockingUploadsResponse)
  const bad = arr.filter((r) => !r.ok || r.status >= 400)
  return {
    uploads: {
      total: uploads.length,
      ok: uploads.filter((r) => r.ok && r.status < 400).length,
      entries: uploads.slice(0, 40),
    },
    static: {
      total: statics.length,
      ok: statics.filter((r) => r.ok && r.status < 400).length,
      entries: statics.slice(0, 40),
    },
    nonOk: bad.slice(0, 20).map((r) => ({ url: r.url, status: r.status, ok: r.ok })),
    nonOkUploads: badUploads.slice(0, 40).map((r) => ({
      url: r.url,
      pathname: uploadsPathnameFromUrl(r.url),
      status: r.status,
      ok: r.ok,
    })),
    uploads404: badUploads
      .filter((r) => r.status === 404)
      .slice(0, 40)
      .map((r) => ({
        url: r.url,
        pathname: uploadsPathnameFromUrl(r.url),
        status: r.status,
      })),
  }
}

/** Merge network /uploads failures into DOM imageAudit (network is authoritative for HTTP status). */
function enrichImageAuditWithNetworkFailures(imageAudit, networkMediaAudit) {
  const detail = imageAudit?.productDetail
  const phase = networkMediaAudit?.productDetailPhase
  if (!detail?.uploads || !phase?.nonOkUploads?.length) return

  const failed = [...(detail.uploads.failed || [])]
  const seen = new Set(failed.map((f) => f.pathname || uploadsPathnameFromUrl(f.url)))

  for (const row of phase.nonOkUploads) {
    const pathname = row.pathname || uploadsPathnameFromUrl(row.url)
    if (!pathname || seen.has(pathname)) continue
    seen.add(pathname)
    failed.push({
      kind: "network",
      pathname,
      url: row.url,
      status: row.status,
      ok: row.ok,
    })
  }

  detail.uploads.failed = failed.slice(0, 40)
  detail.uploads.failedCount = failed.length
  detail.uploads.networkNonOkCount = phase.nonOkUploads.length
}

/**
 * Strict product media QA when ADMIN_QA_PRODUCT_ID is set and detail phase ran.
 * @returns {{ ok: boolean, reason?: string, uploads404?: object[], nonOkUploads?: object[] }}
 */
function evaluateProductMediaQa(productsProbe, productId, networkMediaAudit) {
  if (productsProbe?.skipped || !productId) {
    return { ok: true, strict: false }
  }
  const phase = networkMediaAudit?.productDetailPhase
  const nonOkUploads = phase?.nonOkUploads || []
  if (nonOkUploads.length === 0) {
    return { ok: true, strict: true }
  }
  return {
    ok: false,
    strict: true,
    reason: "product_detail_uploads_non_ok",
    uploads404: phase.uploads404 || [],
    nonOkUploads,
    nonOkCount: nonOkUploads.length,
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const consoleMessages = []
  const pageErrors = []
  const failedRequests = []

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
  })
  const page = await context.newPage()

  await context.route("**/*", (route) => {
    const headers = { ...route.request().headers() }
    headers["cache-control"] = "no-cache"
    headers["pragma"] = "no-cache"
    route.continue({ headers })
  })

  page.on("response", (res) => {
    try {
      recordMediaResponse(res)
    } catch {
      /* ignore */
    }
  })

  page.on("console", (msg) => {
    const t = msg.type()
    if (t === "error" || t === "warning") {
      consoleMessages.push({ type: t, text: msg.text() })
    }
  })
  page.on("pageerror", (err) => {
    pageErrors.push(String(err.message || err))
  })
  page.on("requestfailed", (req) => {
    const f = req.failure()
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      error: f?.errorText || "unknown",
    })
  })

  const safeWait = async (action) => {
    try {
      await action
    } catch (e) {
      pageErrors.push(`nav: ${String(e?.message || e)}`)
    }
  }

  const collectBackgroundImageUrls = () =>
    page.evaluate(() => {
      const out = []
      const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi
      const walk = (el) => {
        if (!el || el.nodeType !== 1) return
        let bg = ""
        try {
          bg = window.getComputedStyle(el).backgroundImage || ""
        } catch {
          return
        }
        if (!bg || bg === "none") return
        let m
        while ((m = urlRe.exec(bg)) !== null) {
          const u = m[2].trim()
          if (u && !u.startsWith("data:")) out.push(u)
        }
      }
      document.querySelectorAll("*").forEach(walk)
      return out
    })

  // Browser-observable image audit: <img> + CSS background-image url(...) on same origin paths.
  const auditImagesOnCurrentPage = async (label) => {
    try {
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {})
      await page
        .evaluate(async () => {
          await new Promise((resolve) => {
            let y = 0
            const step = 400
            const tick = () => {
              window.scrollTo(0, y)
              y += step
              if (y >= document.documentElement.scrollHeight) {
                window.scrollTo(0, 0)
                resolve()
              } else {
                setTimeout(tick, 80)
              }
            }
            tick()
          })
        })
        .catch(() => {})
      await page.waitForTimeout(1500)

      const imgRaw = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img")).map((img) => ({
          kind: "img",
          url: img.currentSrc || img.src || "",
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          alt: (img.alt || "").slice(0, 80),
        }))
      )
      const bgUrls = await collectBackgroundImageUrls()
      const bgByGroup = { uploads: [], static: [], other: [] }
      for (const u of bgUrls) {
        let pathname = ""
        try {
          pathname = new URL(u).pathname
        } catch {
          try {
            pathname = new URL(u, baseUrl).pathname
          } catch {
            pathname = u
          }
        }
        if (pathname.startsWith("/uploads/")) bgByGroup.uploads.push(u)
        else if (pathname.startsWith("/static/")) bgByGroup.static.push(u)
        else bgByGroup.other.push(u)
      }

      const raw = imgRaw
      const groups = { uploads: [], static: [], other: [], empty: [] }
      for (const it of raw) {
        if (!it.url) {
          groups.empty.push(it)
          continue
        }
        let pathname = ""
        try {
          pathname = new URL(it.url).pathname
        } catch {
          try {
            pathname = new URL(it.url, baseUrl).pathname
          } catch {
            pathname = it.url
          }
        }
        const loaded = !!(it.complete && it.naturalWidth > 0)
        const entry = {
          kind: it.kind,
          url: it.url,
          pathname,
          naturalWidth: it.naturalWidth,
          naturalHeight: it.naturalHeight,
          complete: it.complete,
          alt: it.alt,
          loaded,
        }
        if (pathname.startsWith("/uploads/")) groups.uploads.push(entry)
        else if (pathname.startsWith("/static/")) groups.static.push(entry)
        else groups.other.push(entry)
      }
      const summarize = (arr) => ({
        total: arr.length,
        loaded: arr.filter((x) => x.loaded).length,
        failed: arr
          .filter((x) => !x.loaded)
          .slice(0, 20)
          .map((x) => ({
            kind: x.kind,
            pathname: x.pathname,
            url: x.url,
            naturalWidth: x.naturalWidth,
            naturalHeight: x.naturalHeight,
            complete: x.complete,
            alt: x.alt,
          })),
      })
      return {
        label,
        url: page.url(),
        uploads: summarize(groups.uploads),
        static: summarize(groups.static),
        other: summarize(groups.other),
        emptySrcCount: groups.empty.length,
        backgroundImageUrls: bgByGroup,
      }
    } catch (e) {
      return { label, error: String(e?.message || e) }
    }
  }

  const runReloadProbe = async (label, urlPath) => {
    const url = `${baseUrl}${urlPath}`
    const shots = []
    for (let i = 0; i < 3; i++) {
      const nav =
        i === 0
          ? page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
          : page.reload({ waitUntil: "domcontentloaded", timeout: 60000 })
      await safeWait(nav)
      await page.waitForTimeout(2000)
      const fn = path.join(outDir, `${label}-reload-${i}.png`)
      await page.screenshot({ path: fn, fullPage: true }).catch(() => {})
      shots.push(fn)
    }
    const hard = path.join(outDir, `${label}-hard-reload.png`)
    await safeWait(page.goto(`about:blank`))
    await safeWait(page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }))
    await safeWait(page.evaluate(() => location.reload(true)))
    await page.waitForTimeout(2000)
    await page.screenshot({ path: hard, fullPage: true }).catch(() => {})
    return { shots, hard }
  }

  activeNetworkPhase = null
  await runReloadProbe("app", "/app")
  const titleApp = await page.title()
  const bodyApp = (await page.locator("body").innerText()).slice(0, 2000)

  activeNetworkPhase = null
  await runReloadProbe("login", "/app/login")
  const titleLogin = await page.title()
  const bodyLogin = (await page.locator("body").innerText()).slice(0, 2000)

  const email = process.env.ADMIN_QA_EMAIL
  const password = process.env.ADMIN_QA_PASSWORD
  const productId = (process.env.ADMIN_QA_PRODUCT_ID || "").trim()

  let productsProbe = { skipped: true, reason: "no ADMIN_QA_EMAIL/ADMIN_QA_PASSWORD" }
  const imageAudit = { productsList: null, productDetail: null }

  if (email && password) {
    productsProbe = { skipped: false, productId: productId || null }
    activeNetworkPhase = null
    const session = await ensureAdminSession(page, baseUrl, email, password)
    if (session.ok) {
      productsProbe.loginMode = session.mode
      await page.screenshot({ path: path.join(outDir, "after-login.png"), fullPage: true })

      if (productId) {
        activeNetworkPhase = "productsList"
        resetNetworkPhase("productsList")
        await page.goto(`${baseUrl}/app/products`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {})
        await page.waitForTimeout(2000)
        await page.screenshot({ path: path.join(outDir, "products-list.png"), fullPage: true })
        imageAudit.productsList = await auditImagesOnCurrentPage("products-list")

        activeNetworkPhase = "productDetail"
        resetNetworkPhase("productDetail")
        await page.goto(`${baseUrl}/app/products/${encodeURIComponent(productId)}`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        })
        await page.waitForTimeout(2500)
        await page.screenshot({ path: path.join(outDir, "product-detail.png"), fullPage: true })
        imageAudit.productDetail = await auditImagesOnCurrentPage("product-detail")
      } else {
        activeNetworkPhase = "productsList"
        resetNetworkPhase("productsList")
        await page.goto(`${baseUrl}/app/products`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {})
        await page.waitForTimeout(2000)
        await page.screenshot({ path: path.join(outDir, "products-list.png"), fullPage: true })
        imageAudit.productsList = await auditImagesOnCurrentPage("products-list")

        activeNetworkPhase = "productDetail"
        resetNetworkPhase("productDetail")
        const firstRow = page.locator('a[href*="/products/prod_"], table a, [data-testid="product-row"] a').first()
        if (await firstRow.count()) {
          await firstRow.click()
          await page.waitForTimeout(2500)
          await page.screenshot({ path: path.join(outDir, "product-detail.png"), fullPage: true })
          imageAudit.productDetail = await auditImagesOnCurrentPage("product-detail")
        }
      }
      activeNetworkPhase = null
    } else {
      productsProbe = { skipped: true, reason: session.reason }
    }
  }

  const networkMediaAudit = {
    productsListPhase: summarizeNetworkArray(networkByPhase.productsList),
    productDetailPhase: summarizeNetworkArray(networkByPhase.productDetail),
  }

  enrichImageAuditWithNetworkFailures(imageAudit, networkMediaAudit)
  const productMediaQa = evaluateProductMediaQa(productsProbe, productId, networkMediaAudit)

  const blockingConsole = consoleMessages.filter((m) => {
    if (m.type !== "error") return false
    if (m.text.includes("401")) return false
    if (productMediaQa.strict && /404\s*\(Not Found\)/i.test(m.text)) return false
    return true
  })

  const blockingFailedRequests = failedRequests.filter((r) => {
    const u = r.url
    return (
      u.includes("/app/") &&
      (u.endsWith(".js") || u.endsWith(".css") || u.endsWith(".jsx") || u.includes("/@vite/"))
    )
  })

  const smokeOnly = productsProbe?.skipped
  const qaOk =
    !pageErrors.length &&
    !blockingConsole.length &&
    productMediaQa.ok &&
    (smokeOnly || productsProbe?.loginMode)

  const report = {
    ok: qaOk,
    baseUrl,
    capturedAt: new Date().toISOString(),
    titles: { app: titleApp, login: titleLogin },
    bodyPreview: { app: bodyApp, login: bodyLogin },
    consoleErrorsAndWarnings: consoleMessages,
    pageErrors,
    failedRequests: blockingFailedRequests,
    allFailedRequestsSample: failedRequests.slice(0, 40),
    screenshotsDir: outDir,
    productsProbe,
    imageAudit: smokeOnly ? null : imageAudit,
    networkMediaAudit: smokeOnly ? null : networkMediaAudit,
    productMediaQa: smokeOnly ? { ok: true, strict: false, skipped: true } : productMediaQa,
  }

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8")

  await browser.close()

  const summary = {
    ok: qaOk,
    reportPath: path.join(outDir, "report.json"),
    screenshotsDir: outDir,
    productsProbeSkipped: smokeOnly,
    productMediaQa,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (!qaOk) {
    process.exitCode = 2
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
