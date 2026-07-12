/**
 * G1 live gate: default `/store/products` vs `/store/catalog-products`
 * byte delta + id-set equality.
 *
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/g1-catalog-view-measure.ts
 *
 * Writes: tmp/catalog-perf/g1-catalog-view-measure.{json,md}
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const API =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

if (!KEY) {
  console.error("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing")
  process.exit(1)
}

type Payload = {
  status: number
  ms: number
  bytes: number
  n: number
  idsHash: string
  ids: string[]
  metaBytes: number
  hasSharedScene: boolean
  hasWorkbook: boolean
}

async function fetchList(path: string): Promise<Payload> {
  const url = `${API}${path}`
  const t0 = Date.now()
  const res = await fetch(url, {
    headers: { "x-publishable-api-key": KEY! },
    cache: "no-store",
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const ms = Date.now() - t0
  let products: Array<Record<string, unknown>> = []
  try {
    const json = JSON.parse(buf.toString("utf8")) as {
      products?: Array<Record<string, unknown>>
    }
    products = json.products ?? []
  } catch {
    products = []
  }
  const ids = products.map((p) => String(p.id)).sort()
  let metaBytes = 0
  let hasSharedScene = false
  let hasWorkbook = false
  for (const p of products) {
    const meta = p.metadata
    if (meta && typeof meta === "object") {
      metaBytes += Buffer.byteLength(JSON.stringify(meta), "utf8")
      const m = meta as Record<string, unknown>
      if (m.shared_scene_media != null) hasSharedScene = true
      if (m.workbook_row_key != null) hasWorkbook = true
    }
  }
  return {
    status: res.status,
    ms,
    bytes: buf.length,
    n: products.length,
    idsHash: createHash("sha256").update(ids.join("\n")).digest("hex"),
    ids,
    metaBytes,
    hasSharedScene,
    hasWorkbook,
  }
}

async function main() {
  const full = await fetchList("/store/products")
  const catalog = await fetchList("/store/catalog-products")

  const idEqual =
    full.n === catalog.n &&
    full.idsHash === catalog.idsHash &&
    full.ids.every((id, i) => id === catalog.ids[i])

  const report = {
    measuredAt: new Date().toISOString(),
    api: API,
    full: {
      status: full.status,
      ms: full.ms,
      bytes: full.bytes,
      n: full.n,
      idsHash: full.idsHash,
      metaBytes: full.metaBytes,
      hasSharedScene: full.hasSharedScene,
      hasWorkbook: full.hasWorkbook,
    },
    catalog: {
      status: catalog.status,
      ms: catalog.ms,
      bytes: catalog.bytes,
      n: catalog.n,
      idsHash: catalog.idsHash,
      metaBytes: catalog.metaBytes,
      hasSharedScene: catalog.hasSharedScene,
      hasWorkbook: catalog.hasWorkbook,
    },
    deltaBytes: full.bytes - catalog.bytes,
    metaDeltaBytes: full.metaBytes - catalog.metaBytes,
    ratio: +(catalog.bytes / Math.max(1, full.bytes)).toFixed(4),
    idEqual,
    gate: {
      httpOk: full.status === 200 && catalog.status === 200,
      idEqual,
      catalogDropsSharedOrWorkbook:
        !catalog.hasSharedScene && !catalog.hasWorkbook,
      sizeReduced: catalog.bytes < full.bytes,
    },
  }

  const md = `# G1 catalog-products measure

- Measured: ${report.measuredAt}
- API: \`${API}\`

| path | status | ms | bytes | n | metaBytes | shared_scene | workbook |
|------|--------|----|-------|---|-----------|--------------|----------|
| /store/products | ${full.status} | ${full.ms} | ${full.bytes} | ${full.n} | ${full.metaBytes} | ${full.hasSharedScene} | ${full.hasWorkbook} |
| /store/catalog-products | ${catalog.status} | ${catalog.ms} | ${catalog.bytes} | ${catalog.n} | ${catalog.metaBytes} | ${catalog.hasSharedScene} | ${catalog.hasWorkbook} |

- deltaBytes: **${report.deltaBytes}**
- metaDeltaBytes: **${report.metaDeltaBytes}**
- ratio: **${report.ratio}**
- idEqual: **${idEqual}**
- idsHash: \`${full.idsHash.slice(0, 16)}…\`

## Gate

- httpOk: ${report.gate.httpOk}
- idEqual: ${report.gate.idEqual}
- catalog drops shared_scene/workbook: ${report.gate.catalogDropsSharedOrWorkbook}
- sizeReduced: ${report.gate.sizeReduced}
`

  writeFileSync(
    resolve(OUT, "g1-catalog-view-measure.json"),
    JSON.stringify(report, null, 2)
  )
  writeFileSync(resolve(OUT, "g1-catalog-view-measure.md"), md)
  console.log(md)

  const pass =
    report.gate.httpOk &&
    report.gate.idEqual &&
    report.gate.catalogDropsSharedOrWorkbook &&
    report.gate.sizeReduced

  if (!pass) {
    console.error("G1 measure gate FAILED")
    process.exit(1)
  }
  console.log("G1 measure gate OK")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
