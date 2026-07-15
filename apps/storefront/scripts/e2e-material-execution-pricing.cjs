/**
 * Browser + API E2E for material-execution × finish pricing.
 *
 * Requires Playwright (Chromium). Resolution order:
 *   1) PLAYWRIGHT_MODULE
 *   2) node_modules/playwright (cwd / storefront / repo)
 *   3) ~/.claude/skills/playwright-skill/node_modules/playwright
 *
 * Usage (repo root or apps/storefront):
 *   STORE_URL=http://127.0.0.1:3002 BACKEND_URL=http://127.0.0.1:9000 \
 *   node apps/storefront/scripts/e2e-material-execution-pricing.cjs
 *
 * Optional:
 *   PDP_HANDLE=greenwich-gr-05-1
 *   ARTIFACT_DIR=docs/reports/material-execution-pricing/runs/<ts>/e2e
 *   PUBLISHABLE_KEY from apps/storefront/.env.local (auto-loaded if present)
 */

const fs = require("fs")
const path = require("path")
const os = require("os")

const STORE = process.env.STORE_URL || "http://127.0.0.1:3002"
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:9000"
const PRODUCT = process.env.PDP_HANDLE || "greenwich-gr-05-1"
const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR ||
  path.join(os.tmpdir(), `material-pricing-e2e-${Date.now()}`)

function resolvePlaywright() {
  const candidates = []
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE)
  candidates.push(
    path.resolve(process.cwd(), "node_modules/playwright"),
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../../node_modules/playwright"),
    path.join(os.homedir(), ".claude/skills/playwright-skill/node_modules/playwright")
  )
  for (const c of candidates) {
    try {
      return require(c)
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "playwright not found. Set PLAYWRIGHT_MODULE or install playwright / use playwright-skill."
  )
}

function loadPublishableKey() {
  if (process.env.PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) {
    return (
      process.env.PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    )
  }
  const envPath = path.resolve(__dirname, "../.env.local")
  if (!fs.existsSync(envPath)) return ""
  const raw = fs.readFileSync(envPath, "utf8")
  const m = raw.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.*)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

const checks = []
function check(name, pass, detail) {
  const row = { check: name, pass: Boolean(pass), detail: detail ?? null }
  checks.push(row)
  console.log(JSON.stringify(row))
  return row.pass
}

async function api(method, p, body, pk) {
  const res = await fetch(`${BACKEND}${p}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-publishable-api-key": pk,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 400) }
  }
  return { status: res.status, data }
}

async function runApiSuite(pk) {
  if (!pk) {
    check("api_publishable_key", false, { reason: "missing publishable key" })
    return
  }
  check("api_publishable_key", true, { len: pk.length })

  const regions = await api("GET", "/store/regions", null, pk)
  const regionId = regions.data?.regions?.[0]?.id
  const list = await api(
    "GET",
    "/store/products?limit=80&fields=id,handle,metadata,*variants.id",
    null,
    pk
  )
  const products = list.data?.products || []
  const withFinish = products.find((p) => {
    const mt = p.metadata?.material_tiers
    const finishes =
      p.metadata?.paint_finish_executions ||
      p.metadata?.finish_color_executions ||
      []
    return (
      mt &&
      typeof mt === "object" &&
      mt.solid_front_ldsp_body &&
      mt.solid_full &&
      Array.isArray(finishes) &&
      finishes.length >= 2 &&
      p.variants?.[0]
    )
  })
  const withTiers =
    withFinish ||
    products.find((p) => {
      const mt = p.metadata?.material_tiers
      return (
        mt &&
        typeof mt === "object" &&
        mt.solid_front_ldsp_body &&
        mt.solid_full &&
        p.variants?.[0]
      )
    })

  if (!withTiers) {
    check("api_product_with_tiers", false)
    return
  }
  check("api_product_with_tiers", true, { handle: withTiers.handle })

  const variantId = withTiers.variants[0].id
  const cartB1 = (await api("POST", "/store/carts", { region_id: regionId }, pk))
    .data.cart.id
  const b1 = await api(
    "POST",
    `/store/carts/${cartB1}/line-items`,
    { variant_id: variantId, quantity: 1, metadata: {} },
    pk
  )
  check(
    "api_B1_material_required",
    b1.status === 400 && b1.data?.code === "MATERIAL_EXECUTION_REQUIRED",
    { status: b1.status, code: b1.data?.code }
  )

  const unknown = await api(
    "POST",
    `/store/carts/${cartB1}/line-items`,
    {
      variant_id: variantId,
      quantity: 1,
      metadata: { material_execution_code: "not_a_real_tier" },
    },
    pk
  )
  check(
    "api_unknown_material",
    unknown.status === 400 && unknown.data?.code === "UNKNOWN_MATERIAL_EXECUTION",
    { status: unknown.status, code: unknown.data?.code }
  )

  const cartOk = (await api("POST", "/store/carts", { region_id: regionId }, pk))
    .data.cart.id
  const full = await api(
    "POST",
    `/store/carts/${cartOk}/line-items`,
    {
      variant_id: variantId,
      quantity: 1,
      metadata: { material_execution_code: "solid_full" },
    },
    pk
  )
  const fullItem = (full.data?.cart?.items || []).find(
    (i) => i.metadata?.material_execution_code === "solid_full"
  )
  const base = Number(fullItem?.metadata?.resolved_unit_price ?? fullItem?.unit_price)
  check("api_full_solid", full.status === 200 && Number.isFinite(base) && base > 0, {
    base,
  })

  const cartLdsp = (await api("POST", "/store/carts", { region_id: regionId }, pk))
    .data.cart.id
  const ldsp = await api(
    "POST",
    `/store/carts/${cartLdsp}/line-items`,
    {
      variant_id: variantId,
      quantity: 1,
      metadata: {
        material_execution_code: "solid_front_ldsp_body",
        material_execution_label: "FORGED",
        material_price_multiplier: 0.01,
        resolved_unit_price: 1,
      },
    },
    pk
  )
  const ldspItem = (ldsp.data?.cart?.items || [])[0]
  const expectedLdsp = Math.round(base * 0.7)
  check(
    "api_ldsp_price_and_rewrite",
    ldsp.status === 200 &&
      ldspItem?.unit_price === expectedLdsp &&
      ldspItem?.metadata?.material_price_multiplier === 0.7 &&
      ldspItem?.metadata?.material_execution_label !== "FORGED",
    {
      unit: ldspItem?.unit_price,
      expectedLdsp,
      label: ldspItem?.metadata?.material_execution_label,
    }
  )

  // Quantity > 1: unit stays configured once; no double material discount.
  const cartQty = (await api("POST", "/store/carts", { region_id: regionId }, pk))
    .data.cart.id
  const qtyAdd = await api(
    "POST",
    `/store/carts/${cartQty}/line-items`,
    {
      variant_id: variantId,
      quantity: 2,
      metadata: { material_execution_code: "solid_front_ldsp_body" },
    },
    pk
  )
  const qtyItem = (qtyAdd.data?.cart?.items || [])[0]
  check(
    "api_qty2_unit_once",
    qtyAdd.status === 200 &&
      qtyItem?.quantity === 2 &&
      qtyItem?.unit_price === expectedLdsp &&
      qtyItem?.metadata?.material_price_multiplier === 0.7 &&
      qtyItem?.metadata?.resolved_unit_price === expectedLdsp,
    {
      qty: qtyItem?.quantity,
      unit: qtyItem?.unit_price,
      expectedLdsp,
      resolved: qtyItem?.metadata?.resolved_unit_price,
    }
  )

  if (withFinish) {
    const finishes =
      withFinish.metadata.paint_finish_executions ||
      withFinish.metadata.finish_color_executions
    const prem = finishes[1].key
    const cartPrem = (
      await api("POST", "/store/carts", { region_id: regionId }, pk)
    ).data.cart.id
    const premAdd = await api(
      "POST",
      `/store/carts/${cartPrem}/line-items`,
      {
        variant_id: withFinish.variants[0].id,
        quantity: 1,
        metadata: {
          material_execution_code: "solid_front_ldsp_body",
          finish_execution_key: prem,
        },
      },
      pk
    )
    // Recompute base for this product
    const cartBase = (
      await api("POST", "/store/carts", { region_id: regionId }, pk)
    ).data.cart.id
    const full2 = await api(
      "POST",
      `/store/carts/${cartBase}/line-items`,
      {
        variant_id: withFinish.variants[0].id,
        quantity: 1,
        metadata: { material_execution_code: "solid_full" },
      },
      pk
    )
    const base2 = Number(
      (full2.data?.cart?.items || [])[0]?.metadata?.resolved_unit_price ??
        (full2.data?.cart?.items || [])[0]?.unit_price
    )
    const item = (premAdd.data?.cart?.items || [])[0]
    const expectedPrem = Math.round(base2 * 0.7 * 1.05)
    check(
      "api_ldsp_premium_finish",
      premAdd.status === 200 &&
        item?.unit_price === expectedPrem &&
        item?.metadata?.finish_color_multiplier === 1.05,
      {
        handle: withFinish.handle,
        prem,
        unit: item?.unit_price,
        expectedPrem,
        color_mult: item?.metadata?.finish_color_multiplier,
      }
    )
  } else {
    check("api_ldsp_premium_finish", true, { skipped: "no finish product in page" })
  }
}

async function runBrowserSuite(chromium) {
  ensureDir(ARTIFACT_DIR)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(`${STORE}/product/${PRODUCT}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "pdp-default.png"),
    fullPage: false,
  })

  const trigger = page.locator(".pdp-material-trigger").first()
  const visible = await trigger.isVisible().catch(() => false)
  check("ui_dropdown_visible", visible)
  if (!visible) {
    await browser.close()
    return
  }

  const role = await trigger.getAttribute("role")
  check("ui_combobox_role", role === "combobox", { role })

  const closedText = await trigger.innerText()
  check("ui_default_ldsp", /ЛДСП|Фасады из массива/i.test(closedText), {
    text: closedText.replace(/\s+/g, " ").slice(0, 160),
  })

  await trigger.focus()
  await page.keyboard.press("Enter")
  await page.waitForTimeout(350)
  check("ui_open_enter", (await trigger.getAttribute("aria-expanded")) === "true")
  const options = page.locator("[role='option']")
  const optCount = await options.count()
  check("ui_two_options", optCount >= 2, { optCount })
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(100)
  check(
    "ui_aria_activedescendant",
    Boolean(await trigger.getAttribute("aria-activedescendant"))
  )

  if (optCount >= 2) {
    await options.nth(1).click()
    await page.waitForTimeout(400)
    const after = await trigger.innerText()
    check("ui_select_full_solid", /Полностью из массива/i.test(after), {
      text: after.replace(/\s+/g, " ").slice(0, 160),
    })
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "pdp-full-solid.png"),
      fullPage: false,
    })
  }

  await trigger.click()
  await page.waitForTimeout(200)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  check(
    "ui_escape_closes",
    (await trigger.getAttribute("aria-expanded")) === "false"
  )

  // back to LDSP + add to cart
  await trigger.click()
  await page.waitForTimeout(200)
  if ((await options.count()) > 0) {
    await options.nth(0).click()
    await page.waitForTimeout(300)
  }
  for (const label of ["Подтвердить исполнение", "Подтвердить", "Готово"]) {
    const btn = page.locator(`button:has-text("${label}")`).first()
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => null)
      await page.waitForTimeout(400)
      break
    }
  }
  const addBtn = page.locator("button:has-text('В корзину')").first()
  const canAdd =
    (await addBtn.isVisible().catch(() => false)) &&
    (await addBtn.isEnabled().catch(() => false))
  if (canAdd) {
    await addBtn.click()
    await page.waitForTimeout(2000)
    await page.goto(`${STORE}/cart`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    await page.waitForTimeout(1000)
    const body = await page.locator("main").innerText().catch(async () =>
      page.locator("body").innerText()
    )
    const hasLabel =
      /Исполнение\s*:/i.test(body) &&
      /Фасады из массива\s*\+\s*корпус\s*ЛДСП/i.test(body)
    check("ui_cart_execution_label", hasLabel, {
      snippet: body.replace(/\s+/g, " ").slice(0, 280),
    })
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "cart.png"),
      fullPage: false,
    })
  } else {
    check("ui_cart_execution_label", false, { reason: "add-to-cart not enabled" })
  }

  const material = encodeURIComponent("Фасады из массива + корпус ЛДСП")
  await page.goto(
    `${STORE}/bespoke/request?product_id=probe&material=${material}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )
  await page.waitForTimeout(500)
  check("ui_bespoke_material_query", page.url().includes("material="))
  check("ui_bespoke_form", (await page.locator("form").count()) > 0)

  for (const w of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.goto(`${STORE}/product/${PRODUCT}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    await page.waitForTimeout(800)
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    check(`ui_responsive_${w}`, metrics.scrollWidth <= metrics.clientWidth + 3, metrics)
  }

  await browser.close()
}

;(async () => {
  ensureDir(ARTIFACT_DIR)
  const healthStore = await fetch(STORE, { signal: AbortSignal.timeout(5000) })
    .then((r) => r.status)
    .catch(() => 0)
  const healthBackend = await fetch(`${BACKEND}/health`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.status)
    .catch(() => 0)
  check("health_storefront", healthStore > 0 && healthStore < 500, {
    status: healthStore,
  })
  check("health_backend", healthBackend === 200, { status: healthBackend })

  const pk = loadPublishableKey()
  await runApiSuite(pk)

  const { chromium } = resolvePlaywright()
  await runBrowserSuite(chromium)

  const failed = checks.filter((c) => !c.pass)
  const summary = {
    total: checks.length,
    failed: failed.length,
    failedNames: failed.map((f) => f.check),
    artifactDir: ARTIFACT_DIR,
    product: PRODUCT,
    store: STORE,
    backend: BACKEND,
    at: new Date().toISOString(),
  }
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "results.json"),
    JSON.stringify({ summary, checks }, null, 2)
  )
  console.log(JSON.stringify({ summary }))
  process.exit(failed.length ? 1 : 0)
})().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e))
  process.exit(1)
})
