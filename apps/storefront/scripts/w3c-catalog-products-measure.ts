/**
 * W3c: measure `/store/catalog-products` after browse-mode projected query.
 *
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/w3c-catalog-products-measure.ts
 *
 * Writes: tmp/catalog-perf/w3c-projected-query-measure.{md,json}
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const API =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const RUNS = 5

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y)
  return a[Math.floor(a.length / 2)] ?? 0
}

async function main() {
  if (!KEY) {
    console.error("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing")
    process.exit(1)
  }

  const runs = []
  let sample: { n: number; idSample: string[] } | null = null
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now()
    const res = await fetch(`${API}/store/catalog-products`, {
      headers: { "x-publishable-api-key": KEY },
      cache: "no-store",
    })
    const buf = Buffer.from(await res.arrayBuffer())
    const ms = Date.now() - t0
    if (!res.ok) {
      console.error("HTTP", res.status)
      process.exit(1)
    }
    const data = JSON.parse(buf.toString("utf8")) as {
      products?: Array<{ id?: string }>
    }
    const products = data.products ?? []
    if (!sample) {
      sample = {
        n: products.length,
        idSample: products.slice(0, 5).map((p) => String(p.id ?? "")),
      }
    }
    runs.push({ status: res.status, ms, bytes: buf.length, n: products.length })
  }

  const report = {
    measuredAt: new Date().toISOString(),
    api: `${API}/store/catalog-products`,
    note: "Browse mode always uses fixed field set (no `*`). Compare medianBytes to g2 ~399KB.",
    priorG2BytesApprox: 399_000,
    runs,
    medianMs: median(runs.map((r) => r.ms)),
    medianBytes: median(runs.map((r) => r.bytes)),
    sample,
  }

  const ratio =
    report.priorG2BytesApprox > 0
      ? (report.medianBytes / report.priorG2BytesApprox).toFixed(3)
      : "n/a"

  const md = `# W3c projected query measure

- Measured: ${report.measuredAt}
- Endpoint: \`${report.api}\`
- median **${report.medianMs} ms** / **${report.medianBytes} B**
- vs G2 ~399KB ratio: **${ratio}**
- n products: **${sample?.n ?? 0}** (expect 157)

${report.note}
`

  writeFileSync(
    resolve(OUT, "w3c-projected-query-measure.json"),
    JSON.stringify(report, null, 2)
  )
  writeFileSync(resolve(OUT, "w3c-projected-query-measure.md"), md)
  console.log(md)

  if ((sample?.n ?? 0) !== 157) {
    console.error("W3c gate FAILED: expected 157 products")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
