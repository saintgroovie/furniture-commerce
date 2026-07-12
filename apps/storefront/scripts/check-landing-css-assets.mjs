/**
 * Post-build / post-restart check: HTML for / /kids /bespoke must reference
 * CSS chunks that the running next start process can actually serve (200).
 *
 * Prevents the "unstyled purple logo / vertical nav list" failure mode where
 * `.next-build` was rebuilt while the QA process kept an old in-memory
 * manifest. Run after `yarn build` + `launchctl kickstart` of
 * com.woodright.storefront-qa.
 *
 * Usage: node scripts/check-landing-css-assets.mjs [baseUrl]
 * Exit 0 = ok, 1 = broken CSS refs.
 */

const BASE = process.argv[2] || "http://localhost:3002"
const ROUTES = ["/", "/kids", "/bespoke"]

async function cssRefs(html) {
  const out = []
  const re = /\/_next\/static\/css\/[^"'\\s>]+\.css/g
  let m
  while ((m = re.exec(html))) out.push(m[0])
  return [...new Set(out)]
}

async function main() {
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

  if (failures.length) {
    console.error("LANDING_CSS_BROKEN", JSON.stringify({ base: BASE, failures }))
    process.exit(1)
  }
  console.log("LANDING_CSS_OK", JSON.stringify({ base: BASE, routes: ROUTES }))
}

main()
