/**
 * H4 baseline: sample catalog hero image bytes (HEAD/GET) from /catalog HTML.
 *
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/h4-catalog-image-baseline.ts
 *
 * Writes tmp/catalog-perf/h4-catalog-image-baseline.{md,json}
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const STORE =
  process.env.NEXT_PUBLIC_SITE_URL?.includes("3002")
    ? "http://127.0.0.1:3002"
    : process.env.STOREFRONT_URL || "http://127.0.0.1:3002"
const API =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://127.0.0.1:9000"

async function headOrGetBytes(url: string): Promise<{
  status: number
  bytes: number | null
  contentType: string | null
}> {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" })
    const len = head.headers.get("content-length")
    if (head.ok && len) {
      return {
        status: head.status,
        bytes: Number(len),
        contentType: head.headers.get("content-type"),
      }
    }
  } catch {
    /* fall through */
  }
  const res = await fetch(url, { cache: "no-store" })
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    bytes: buf.length,
    contentType: res.headers.get("content-type"),
  }
}

function absolutize(src: string): string {
  if (src.startsWith("http")) return src
  if (src.startsWith("/static/") || src.startsWith("/uploads/")) {
    return `${API.replace(/\/$/, "")}${src}`
  }
  if (src.startsWith("/")) return `${STORE.replace(/\/$/, "")}${src}`
  return src
}

async function main() {
  const htmlRes = await fetch(`${STORE}/catalog`, { cache: "no-store" })
  const html = await htmlRes.text()
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]!)
  const unique = [...new Set(imgs)].slice(0, 12)
  const samples = []
  for (const src of unique) {
    const url = absolutize(src)
    const meta = await headOrGetBytes(url)
    samples.push({ src, url, ...meta })
  }
  const withBytes = samples.filter((s) => typeof s.bytes === "number") as Array<
    (typeof samples)[number] & { bytes: number }
  >
  const total = withBytes.reduce((a, s) => a + s.bytes, 0)
  const max = withBytes.reduce(
    (a, s) => (s.bytes > a.bytes ? s : a),
    withBytes[0] || { bytes: 0, src: "", url: "" }
  )

  const report = {
    measuredAt: new Date().toISOString(),
    store: STORE,
    api: API,
    catalogHttp: htmlRes.status,
    imgTags: imgs.length,
    uniqueSampled: unique.length,
    samples,
    sampleTotalBytes: total,
    maxSample: max,
  }

  const md = `# H4 catalog image baseline

- Measured: ${report.measuredAt}
- Store: \`${STORE}\` (HTTP ${htmlRes.status})
- \`<img>\` tags: **${imgs.length}**; sampled unique: **${unique.length}**
- Sample total bytes: **${total}**
- Largest sample: **${max?.bytes ?? 0}** (\`${max?.src ?? ""}\`)

| src | status | bytes | type |
|-----|--------|------:|------|
${samples
  .map(
    (s) =>
      `| \`${s.src.slice(0, 80)}\` | ${s.status} | ${s.bytes ?? "?"} | ${s.contentType ?? ""} |`
  )
  .join("\n")}

## Next
- Generate \`/static/products/.../derivatives/card/*.webp\` (card width ~720)
- Wire \`resolveCatalogCardImageSrc\` when derivatives exist (env flag)
- CDN later
`

  writeFileSync(resolve(OUT, "h4-catalog-image-baseline.json"), JSON.stringify(report, null, 2))
  writeFileSync(resolve(OUT, "h4-catalog-image-baseline.md"), md)
  console.log(md)
  if (htmlRes.status !== 200) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
