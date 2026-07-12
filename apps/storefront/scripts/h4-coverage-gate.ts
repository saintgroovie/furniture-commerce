/**
 * W3b/W3d: H4 card-hero derivative coverage gate.
 *
 * Checks every published catalog-products thumbnail (and first image fallback)
 * has a card WebP on disk and (optional) HTTP 200 from Medusa.
 *
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/h4-coverage-gate.ts
 *   ../backend/node_modules/.bin/tsx scripts/h4-coverage-gate.ts --http
 *   ../backend/node_modules/.bin/tsx scripts/h4-coverage-gate.ts \
 *     --from-file ../../tmp/catalog-perf/catalog-products.g1.json
 *
 * Writes: tmp/catalog-perf/h4-coverage-manifest.{json,md}
 * Exit 1 if any eligible static hero is missing a derivative.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { toCatalogCardDerivativePath } from "../src/lib/catalog-card-image"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const API =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const STATIC_ROOT = resolve(process.cwd(), "../backend/static")
const CHECK_HTTP = process.argv.includes("--http")
const fromFileIdx = process.argv.indexOf("--from-file")
const FROM_FILE =
  fromFileIdx >= 0 ? process.argv[fromFileIdx + 1] : undefined

function toStaticPath(src: string): string | null {
  const t = src.trim()
  if (!t) return null
  const decode = (p: string) => {
    try {
      return decodeURIComponent(p)
    } catch {
      return p
    }
  }
  if (t.startsWith("/static/products/")) return decode(t)
  if (t.startsWith("/product-static/products/")) {
    return decode(`/static/products/${t.slice("/product-static/products/".length)}`)
  }
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      const pathname = decode(u.pathname)
      if (pathname.startsWith("/static/products/")) return pathname
      if (pathname.startsWith("/product-static/products/")) {
        return `/static/products/${pathname.slice("/product-static/products/".length)}`
      }
    } catch {
      return null
    }
  }
  return null
}

function diskPathForStatic(staticPath: string): string {
  // /static/products/... → apps/backend/static/products/...
  const rel = staticPath.replace(/^\/static\//, "")
  return resolve(STATIC_ROOT, rel)
}

type Row = {
  productId: string
  handle: string | null
  source: string
  staticPath: string | null
  derivativePath: string | null
  class: "ok" | "missing_derivative" | "non_static" | "empty"
  diskOk: boolean
  httpStatus?: number
}

async function loadProducts(): Promise<Array<Record<string, unknown>>> {
  if (FROM_FILE) {
    const raw = JSON.parse(readFileSync(resolve(FROM_FILE), "utf8")) as {
      products?: Array<Record<string, unknown>>
    }
    return raw.products ?? []
  }
  if (!KEY) {
    console.error(
      "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing (or pass --from-file)"
    )
    process.exit(1)
  }
  const res = await fetch(`${API}/store/catalog-products`, {
    headers: { "x-publishable-api-key": KEY },
    cache: "no-store",
  })
  if (!res.ok) {
    console.error("catalog-products HTTP", res.status)
    process.exit(1)
  }
  const data = (await res.json()) as {
    products?: Array<Record<string, unknown>>
  }
  return data.products ?? []
}

async function main() {
  const products = await loadProducts()
  const rows: Row[] = []

  for (const p of products) {
    const id = String(p.id ?? "")
    const handle = typeof p.handle === "string" ? p.handle : null
    let source = ""
    if (typeof p.thumbnail === "string" && p.thumbnail.trim()) {
      source = p.thumbnail.trim()
    } else if (Array.isArray(p.images) && p.images[0]) {
      const u = (p.images[0] as { url?: unknown }).url
      if (typeof u === "string") source = u.trim()
    }

    if (!source) {
      rows.push({
        productId: id,
        handle,
        source: "",
        staticPath: null,
        derivativePath: null,
        class: "empty",
        diskOk: false,
      })
      continue
    }

    const staticPath = toStaticPath(source)
    if (!staticPath) {
      rows.push({
        productId: id,
        handle,
        source,
        staticPath: null,
        derivativePath: null,
        class: "non_static",
        diskOk: false,
      })
      continue
    }

    const derivativePath = toCatalogCardDerivativePath(staticPath)
    const diskOk = derivativePath
      ? existsSync(diskPathForStatic(derivativePath))
      : false
    let httpStatus: number | undefined
    if (CHECK_HTTP && derivativePath) {
      const url = `${API.replace(/\/$/, "")}${derivativePath}`
      try {
        const h = await fetch(url, { method: "HEAD", cache: "no-store" })
        httpStatus = h.status
      } catch {
        httpStatus = 0
      }
    }

    const okDiskAndHttp =
      diskOk && (!CHECK_HTTP || httpStatus === 200)

    rows.push({
      productId: id,
      handle,
      source,
      staticPath,
      derivativePath,
      class: okDiskAndHttp ? "ok" : "missing_derivative",
      diskOk,
      httpStatus,
    })
  }

  const summary = {
    measuredAt: new Date().toISOString(),
    source: FROM_FILE ? `file:${FROM_FILE}` : `api:${API}/store/catalog-products`,
    api: API,
    checkHttp: CHECK_HTTP,
    n: rows.length,
    ok: rows.filter((r) => r.class === "ok").length,
    missing_derivative: rows.filter((r) => r.class === "missing_derivative")
      .length,
    non_static: rows.filter((r) => r.class === "non_static").length,
    empty: rows.filter((r) => r.class === "empty").length,
  }

  const missing = rows.filter((r) => r.class === "missing_derivative")
  const md = `# H4 coverage manifest

- Measured: ${summary.measuredAt}
- Products: **${summary.n}**
- ok: **${summary.ok}**
- missing_derivative: **${summary.missing_derivative}**
- non_static: **${summary.non_static}**
- empty: **${summary.empty}**
- HTTP check: ${CHECK_HTTP}

## Missing (first 30)

${
  missing.length === 0
    ? "_none_"
    : missing
        .slice(0, 30)
        .map(
          (r) =>
            `- \`${r.handle ?? r.productId}\` ← \`${r.source}\` → \`${r.derivativePath}\``
        )
        .join("\n")
}
`

  writeFileSync(
    resolve(OUT, "h4-coverage-manifest.json"),
    JSON.stringify({ summary, rows }, null, 2)
  )
  writeFileSync(resolve(OUT, "h4-coverage-manifest.md"), md)
  console.log(md)

  if (summary.missing_derivative > 0) {
    console.error("H4 coverage gate FAILED")
    process.exit(1)
  }
  console.log("H4 coverage gate OK")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
