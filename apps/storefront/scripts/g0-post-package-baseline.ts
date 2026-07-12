/**
 * G0 post-package baseline (measure only).
 * Run from apps/storefront with .env.local:
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/g0-post-package-baseline.ts
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const API = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
const SF = "http://127.0.0.1:3002"

if (!KEY) {
  console.error("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing")
  process.exit(1)
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

async function timedFetch(
  url: string,
  init?: RequestInit
): Promise<{ ms: number; status: number; bytes: number; body: Buffer }> {
  const t0 = Date.now()
  const res = await fetch(url, { ...init, cache: "no-store" })
  const ab = await res.arrayBuffer()
  const body = Buffer.from(ab)
  return {
    ms: Date.now() - t0,
    status: res.status,
    bytes: body.length,
    body,
  }
}

function jsonSizeBreakdown(products: Array<Record<string, unknown>>) {
  let metadata = 0
  let images = 0
  let variants = 0
  let other = 0
  for (const p of products) {
    const full = Buffer.byteLength(JSON.stringify(p))
    const meta = Buffer.byteLength(JSON.stringify(p.metadata ?? null))
    const imgs = Buffer.byteLength(JSON.stringify(p.images ?? null))
    const vars = Buffer.byteLength(JSON.stringify(p.variants ?? null))
    metadata += meta
    images += imgs
    variants += vars
    other += Math.max(0, full - meta - imgs - vars)
  }
  return { metadata, images, variants, other, products: products.length }
}

function countImgs(html: string) {
  const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]!)
  const lazy = (html.match(/loading="lazy"/gi) || []).length
  const eager = (html.match(/loading="eager"/gi) || []).length
  return {
    imgTags: srcs.length,
    uniqueSrcs: new Set(srcs).size,
    lazyAttrs: lazy,
    eagerAttrs: eager,
    sampleSrcs: [...new Set(srcs)].slice(0, 8),
  }
}

function gridLi(html: string): number {
  const m = html.match(/<ul class="product-grid[^"]*">([\s\S]*?)<\/ul>/)
  if (!m) return -1
  return (m[1].match(/<li>/g) || []).length
}

async function headBytes(url: string): Promise<number | null> {
  try {
    const abs = url.startsWith("http") ? url : `${SF}${url}`
    const res = await fetch(abs, { method: "HEAD", cache: "no-store" })
    const cl = res.headers.get("content-length")
    return cl ? Number(cl) : null
  } catch {
    return null
  }
}

async function main() {
  const productsRuns: Array<{ ms: number; bytes: number; status: number }> = []
  let lastProducts: Array<Record<string, unknown>> = []
  for (let i = 0; i < 3; i++) {
    const r = await timedFetch(`${API}/store/products`, {
      headers: { "x-publishable-api-key": KEY },
    })
    productsRuns.push({ ms: r.ms, bytes: r.bytes, status: r.status })
    const j = JSON.parse(r.body.toString("utf8")) as {
      products?: Array<Record<string, unknown>>
    }
    lastProducts = j.products ?? []
  }

  const breakdown = jsonSizeBreakdown(lastProducts)
  const metaKeys = new Map<string, number>()
  for (const p of lastProducts) {
    const m = (p.metadata ?? {}) as Record<string, unknown>
    for (const k of Object.keys(m)) {
      metaKeys.set(k, (metaKeys.get(k) ?? 0) + 1)
    }
  }
  const topMetaKeys = [...metaKeys.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)

  async function pageSeries(path: string) {
    const runs: Array<{
      label: string
      ms: number
      bytes: number
      status: number
      cards: number
      imgs: ReturnType<typeof countImgs>
    }> = []
    for (let i = 0; i < 3; i++) {
      const r = await timedFetch(`${SF}${path}`)
      const html = r.body.toString("utf8")
      runs.push({
        label: i === 0 ? "coldish" : "warm",
        ms: r.ms,
        bytes: r.bytes,
        status: r.status,
        cards: gridLi(html),
        imgs: countImgs(html),
      })
    }
    return runs
  }

  const catalogPages = await pageSeries("/catalog")
  const kidsPages = await pageSeries("/kids/catalog")

  const catalogHtml = (
    await timedFetch(`${SF}/catalog`)
  ).body.toString("utf8")
  const imgs = countImgs(catalogHtml)
  const sampleHeads: Array<{ src: string; bytes: number | null }> = []
  for (const src of imgs.sampleSrcs.slice(0, 5)) {
    sampleHeads.push({ src, bytes: await headBytes(src) })
  }

  const baselineCatalog = existsSync(
    resolve(OUT, "baseline-ids-catalog-scoped.json")
  )
  const phaseA = existsSync(resolve(OUT, "phase-a-id-sets.json"))
    ? JSON.parse(readFileSync(resolve(OUT, "phase-a-id-sets.json"), "utf8"))
    : null

  const report = {
    generatedAt: new Date().toISOString(),
    api: API,
    storefront: SF,
    products: {
      runs: productsRuns,
      medianMs: median(productsRuns.map((r) => r.ms)),
      medianBytes: median(productsRuns.map((r) => r.bytes)),
      count: lastProducts.length,
      breakdownBytes: breakdown,
      topMetadataKeys: topMetaKeys,
    },
    catalog: {
      runs: catalogPages,
      medianMs: median(catalogPages.map((r) => r.ms)),
      medianBytes: median(catalogPages.map((r) => r.bytes)),
    },
    kidsCatalog: {
      runs: kidsPages,
      medianMs: median(kidsPages.map((r) => r.ms)),
      medianBytes: median(kidsPages.map((r) => r.bytes)),
    },
    catalogHtmlImg: imgs,
    sampleImageHeads: sampleHeads,
    continuity: {
      productsCountExpected: 157,
      productsCountOk: lastProducts.length === 157,
      baselineCatalogIdsPresent: baselineCatalog,
      phaseACards: phaseA
        ? { catalog: phaseA.catalogCards, kids: phaseA.kidsCards }
        : null,
    },
  }

  writeFileSync(
    resolve(OUT, "g0-post-package-baseline.json"),
    JSON.stringify(report, null, 2)
  )

  const md = `# G0 post-package catalog perf baseline

Generated: ${report.generatedAt}
API: ${API}
Storefront: ${SF}

## Continuity

- Store products: **${lastProducts.length}** (expect 157) → ${report.continuity.productsCountOk ? "OK" : "FAIL"}
- Phase A cards (prior): catalog ${phaseA?.catalogCards ?? "?"}, kids ${phaseA?.kidsCards ?? "?"}

## /store/products (3 runs)

| Run | ms | bytes |
|-----|-----|-------|
${productsRuns.map((r, i) => `| ${i + 1} | ${r.ms} | ${r.bytes} |`).join("\n")}

- Median: **${report.products.medianMs} ms** / **${(report.products.medianBytes / 1024).toFixed(1)} KB**
- Byte breakdown (sum across products, stringify):
  - metadata: ${(breakdown.metadata / 1024).toFixed(1)} KB
  - images: ${(breakdown.images / 1024).toFixed(1)} KB
  - variants: ${(breakdown.variants / 1024).toFixed(1)} KB
  - other: ${(breakdown.other / 1024).toFixed(1)} KB

Top metadata keys (product count containing key):
${topMetaKeys.map(([k, n]) => `- \`${k}\`: ${n}`).join("\n")}

## Pages (curl wall-time; not browser LCP)

### /catalog
${catalogPages.map((r, i) => `- run ${i + 1} (${r.label}): ${r.ms} ms, ${(r.bytes / 1024).toFixed(1)} KB, cards ${r.cards}, imgTags ${r.imgs.imgTags}`).join("\n")}
- Median: **${report.catalog.medianMs} ms**

### /kids/catalog
${kidsPages.map((r, i) => `- run ${i + 1} (${r.label}): ${r.ms} ms, ${(r.bytes / 1024).toFixed(1)} KB, cards ${r.cards}, imgTags ${r.imgs.imgTags}`).join("\n")}
- Median: **${report.kidsCatalog.medianMs} ms**

## Catalog HTML images (last sample)

- img tags: ${imgs.imgTags}, unique src: ${imgs.uniqueSrcs}
- loading=lazy attrs: ${imgs.lazyAttrs}, eager: ${imgs.eagerAttrs}
- HEAD sample:
${sampleHeads.map((s) => `  - ${s.bytes ?? "?"} B ← ${s.src}`).join("\n")}

## Notes

- Curl wall-time ≠ browser LCP/INP; G0 documents server+HTML transfer and product JSON shape for G1 field budget.
- Next: G1 fixed \`view=catalog\` listing projection (Codex gate).
`

  writeFileSync(resolve(OUT, "g0-post-package-baseline.md"), md)
  console.log(md)
  if (!report.continuity.productsCountOk) process.exit(1)
  console.log("g0: ok →", resolve(OUT, "g0-post-package-baseline.md"))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
