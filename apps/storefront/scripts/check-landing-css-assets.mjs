/**
 * Post-build / post-restart check: HTML for / /kids /bespoke must reference
 * CSS chunks that the running next start process can actually serve (200).
 *
 * Prevents the "unstyled purple logo / vertical nav list" failure mode where
 * `.next-build` was rebuilt while the QA process kept an old in-memory
 * manifest. Prefer `yarn build:qa` (rebuild + verify) or rely on
 * `run-storefront-qa.sh` BUILD_ID watcher + KeepAlive.
 *
 * Usage:
 *   node scripts/check-landing-css-assets.mjs [baseUrl]
 *   node scripts/check-landing-css-assets.mjs --heal [baseUrl]
 *
 * Exit 0 = ok, 1 = broken CSS refs (after optional heal attempt).
 */

const args = process.argv.slice(2)
const heal = args.includes("--heal")
const BASE = args.find((a) => !a.startsWith("--")) || "http://localhost:3002"
const ROUTES = ["/", "/kids", "/bespoke"]
const LABEL = process.env.WOODRIGHT_STOREFRONT_LABEL || "com.woodright.storefront-qa"
const ALLOWED_LABELS = new Set(["com.woodright.storefront-qa"])

async function cssRefs(html) {
  const out = []
  const re = /\/_next\/static\/css\/[^"'\s>]+\.css/g
  let m
  while ((m = re.exec(html))) out.push(m[0])
  return [...new Set(out)]
}

async function probe() {
  const failures = []
  for (const route of ROUTES) {
    const url = `${BASE}${route}`
    let html
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) {
        failures.push(`${route}: HTML ${res.status}`)
        continue
      }
      html = await res.text()
    } catch (err) {
      failures.push(`${route}: fetch failed (${err?.cause?.code || err.message})`)
      continue
    }
    const refs = await cssRefs(html)
    if (refs.length === 0) {
      failures.push(`${route}: no CSS refs in HTML`)
      continue
    }
    for (const ref of refs) {
      const cssUrl = `${BASE}${ref}`
      try {
        const res = await fetch(cssUrl, { signal: AbortSignal.timeout(8000) })
        if (res.status !== 200) {
          failures.push(`${route}: ${ref} → ${res.status}`)
        }
      } catch (err) {
        failures.push(`${route}: ${ref} → ${err.message}`)
      }
    }
  }
  return failures
}

async function kickstart() {
  const { spawnSync } = await import("node:child_process")
  if (!ALLOWED_LABELS.has(LABEL)) {
    console.error("LANDING_CSS_HEAL_FAILED", `refusing label ${LABEL}`)
    return false
  }
  const uid = spawnSync("id", ["-u"], { encoding: "utf8" }).stdout.trim()
  const target = `gui/${uid}/${LABEL}`
  console.log("LANDING_CSS_HEAL kickstart", target)
  const r = spawnSync("launchctl", ["kickstart", "-k", target], { encoding: "utf8" })
  if (r.status !== 0) {
    console.error("LANDING_CSS_HEAL_FAILED", r.stderr || r.stdout || `exit ${r.status}`)
    return false
  }
  return true
}

async function main() {
  let failures = await probe()
  if (failures.length === 0) {
    console.log("LANDING_CSS_OK", JSON.stringify({ base: BASE, routes: ROUTES }))
    process.exit(0)
  }

  console.error("LANDING_CSS_BROKEN", JSON.stringify({ base: BASE, failures }))

  if (!heal) process.exit(1)

  if (!(await kickstart())) process.exit(1)
  await new Promise((r) => setTimeout(r, 8000))
  failures = await probe()
  if (failures.length === 0) {
    console.log("LANDING_CSS_OK", JSON.stringify({ base: BASE, routes: ROUTES, healed: true }))
    process.exit(0)
  }
  console.error("LANDING_CSS_BROKEN", JSON.stringify({ base: BASE, failures, healed: false }))
  process.exit(1)
}

main()
