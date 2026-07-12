/**
 * W3a: production-ish catalog baseline (flag 0 vs 1).
 *
 * Prefer storefront already running via `yarn build && yarn start` on :3002
 * with the same NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES baked at build time.
 * This script does NOT start servers.
 *
 * Cold-ish runs: Cache-Control: no-cache + unique query bust on each fetch.
 * True browser cold (empty disk cache / new process) still needs DevTools.
 *
 *   set -a && source .env.local && set +a
 *   FLAG=0 ../backend/node_modules/.bin/tsx scripts/w3a-prod-baseline.ts
 *   FLAG=1 ../backend/node_modules/.bin/tsx scripts/w3a-prod-baseline.ts
 *
 * Writes: tmp/catalog-perf/w3a-prod-baseline-flag-{0|1}.{md,json}
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const STORE = process.env.STOREFRONT_URL || "http://127.0.0.1:3002"
const API =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const RUNS = 3
const FLAG =
  process.env.FLAG ??
  (process.env.NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES === "1" ? "1" : "0")

async function timeFetch(url: string, init?: RequestInit) {
  const bust = `${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}-${Math.random()}`
  const t0 = Date.now()
  const res = await fetch(bust, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers || {}),
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  })
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    ms: Date.now() - t0,
    bytes: buf.length,
    body: buf.toString("utf8"),
  }
}

function cardCount(html: string): number {
  const m = html.match(/<ul class="product-grid[^"]*">([\s\S]*?)<\/ul>/)
  if (!m) return 0
  return (m[1].match(/<li>/g) || []).length
}

/** First catalog card <img> src as LCP candidate proxy (SSR HTML). */
function firstCardImg(html: string): { src: string | null; count: number } {
  const m = html.match(/<ul class="product-grid[^"]*">([\s\S]*?)<\/ul>/)
  if (!m) return { src: null, count: 0 }
  const imgs = [...m[1].matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)]
  return { src: imgs[0]?.[1] ?? null, count: imgs.length }
}

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y)
  return a[Math.floor(a.length / 2)] ?? 0
}

async function headBytes(absoluteOrPath: string): Promise<{
  status: number
  bytes: number | null
  url: string
}> {
  let url = absoluteOrPath
  if (url.startsWith("/")) url = `${STORE.replace(/\/$/, "")}${url}`
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
    const len = res.headers.get("content-length")
    return {
      status: res.status,
      bytes: len ? Number(len) : null,
      url,
    }
  } catch {
    return { status: 0, bytes: null, url }
  }
}

async function measurePage(path: string) {
  const runs = []
  let lastHtml = ""
  for (let i = 0; i < RUNS; i++) {
    const r = await timeFetch(`${STORE}${path}`)
    lastHtml = r.body
    const img = firstCardImg(r.body)
    runs.push({
      status: r.status,
      ms: r.ms,
      bytes: r.bytes,
      cards: cardCount(r.body),
      derivUrls: (r.body.match(/\/derivatives\/card\//g) || []).length,
      imgTags: img.count,
      lcpCandidateSrc: img.src,
    })
  }
  const img = firstCardImg(lastHtml)
  const lcpHead = img.src ? await headBytes(img.src) : null
  return {
    path,
    runs,
    medianMs: median(runs.map((x) => x.ms)),
    medianBytes: median(runs.map((x) => x.bytes)),
    cards: runs[runs.length - 1]?.cards ?? 0,
    derivUrls: runs[runs.length - 1]?.derivUrls ?? 0,
    imgTags: runs[runs.length - 1]?.imgTags ?? 0,
    pageStatusOk: runs.every((x) => x.status === 200),
    lcpCandidateSrc: img.src,
    lcpCandidateHead: lcpHead,
  }
}

async function main() {
  if (!KEY) {
    console.error("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing")
    process.exit(1)
  }

  const apiRuns = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now()
    const res = await fetch(
      `${API}/store/catalog-products?_cb=${Date.now()}-${i}`,
      {
        headers: {
          "x-publishable-api-key": KEY,
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      }
    )
    const buf = Buffer.from(await res.arrayBuffer())
    apiRuns.push({ status: res.status, ms: Date.now() - t0, bytes: buf.length })
  }

  const catalog = await measurePage("/catalog")
  const kids = await measurePage("/kids/catalog")

  const expectDeriv = FLAG === "1"
  const report = {
    measuredAt: new Date().toISOString(),
    store: STORE,
    api: API,
    flagDerivatives: FLAG,
    note:
      "Bake NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES at next build. Script cold-busts HTTP only; use DevTools for true browser cold.",
    catalogProductsApi: {
      runs: apiRuns,
      medianMs: median(apiRuns.map((x) => x.ms)),
      medianBytes: median(apiRuns.map((x) => x.bytes)),
      statusOk: apiRuns.every((r) => r.status === 200),
    },
    catalog,
    kids,
  }

  const md = `# W3a production baseline (flag ${FLAG})

- Measured: ${report.measuredAt}
- Store: \`${STORE}\`
- Flag: **${FLAG}**

## /store/catalog-products

- median **${report.catalogProductsApi.medianMs} ms** / **${report.catalogProductsApi.medianBytes} B**
- status OK: ${report.catalogProductsApi.statusOk}

## /catalog

- median **${catalog.medianMs} ms** / **${catalog.medianBytes} B**
- HTTP 200 all runs: **${catalog.pageStatusOk}**
- cards: **${catalog.cards}** (expect 107)
- img tags: **${catalog.imgTags}**
- derivative URLs: **${catalog.derivUrls}** (expect ${expectDeriv ? ">0" : "0"})
- LCP candidate src: \`${catalog.lcpCandidateSrc ?? "n/a"}\`
- LCP candidate HEAD: status ${catalog.lcpCandidateHead?.status ?? "n/a"}, bytes ${catalog.lcpCandidateHead?.bytes ?? "n/a"}

## /kids/catalog

- median **${kids.medianMs} ms** / **${kids.medianBytes} B**
- HTTP 200 all runs: **${kids.pageStatusOk}**
- cards: **${kids.cards}** (expect 38)
- derivative URLs: **${kids.derivUrls}**
- LCP candidate src: \`${kids.lcpCandidateSrc ?? "n/a"}\`
- LCP candidate HEAD: status ${kids.lcpCandidateHead?.status ?? "n/a"}, bytes ${kids.lcpCandidateHead?.bytes ?? "n/a"}
`

  const base = `w3a-prod-baseline-flag-${FLAG}`
  writeFileSync(resolve(OUT, `${base}.json`), JSON.stringify(report, null, 2))
  writeFileSync(resolve(OUT, `${base}.md`), md)
  // Convenience alias for latest run of this flag
  writeFileSync(resolve(OUT, "w3a-prod-baseline.md"), md)
  writeFileSync(resolve(OUT, "w3a-prod-baseline.json"), JSON.stringify(report, null, 2))
  console.log(md)

  const flagBehaviorOk = expectDeriv
    ? catalog.derivUrls > 0 && kids.derivUrls > 0
    : catalog.derivUrls === 0 && kids.derivUrls === 0

  const ok =
    catalog.cards === 107 &&
    kids.cards === 38 &&
    catalog.pageStatusOk &&
    kids.pageStatusOk &&
    apiRuns.every((r) => r.status === 200) &&
    flagBehaviorOk
  if (!ok) {
    console.error("W3a baseline gate FAILED (status/cards/flag derivatives)")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
