#!/usr/bin/env node
/**
 * Scrape Greenwich finish colors from woodright.ru (per-SKU variation galleries).
 * Usage: node fetch-greenwich-finish-colors.mjs [handle ...]
 *        node fetch-greenwich-finish-colors.mjs --summary-only
 * Output: manifests/<handle>.json + static files under apps/backend/static/products/greenwich/
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "../..")
const STATIC_DIR = path.join(ROOT, "apps/backend/static/products/greenwich")
const MANIFEST_DIR = path.join(HERE, "manifests")
const REGISTRY = JSON.parse(fs.readFileSync(path.join(HERE, "sku-registry.json"), "utf8"))
const UA = "Mozilla/5.0 (Woodright Greenwich import)"

const LABEL_TOKEN = {
  белый: "white",
  графит: "graphite",
  изумруд: "green",
  какао: "cacao",
  капучино: "capuchino",
  олива: "olive",
  пудра: "powder",
  "серо-голубой": "grey-blue",
  серый: "grey",
  "син-серый": "darkblue",
  сливочный: "cream",
  терракота: "terracote",
}

function tokenFromLabel(label) {
  const norm = label.trim().toLowerCase().replace(/\s+/g, " ")
  for (const [prefix, token] of Object.entries(LABEL_TOKEN)) {
    if (norm.startsWith(prefix)) return token
  }
  return null
}

function tokenFromFilename(filename) {
  const hay = filename.toLowerCase()
  const m = hay.match(/greenwich[_-]([a-z0-9-]+?)(?:\d{2}|07|08|09|04|05|06|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)(?:[_\-.]|$)/i)
  if (!m?.[1]) return null
  const raw = m[1].toLowerCase()
  if (raw === "dark" && hay.includes("dark_white")) return "white"
  if (raw === "dark" && hay.includes("darkblue")) return "darkblue"
  if (raw.startsWith("dark_")) return raw.slice(5)
  return raw
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

function parseSwatches(html, baseUrl) {
  const swatches = []
  const re = /href="([^"]*\?variation_id=(\d+))"[^>]*title="([^"]+)"/gi
  let m
  while ((m = re.exec(html))) {
    const label = m[3].trim()
    const token = tokenFromLabel(label)
    if (!token) continue
    swatches.push({
      variation_id: m[2],
      label,
      token,
      page_url: m[1].startsWith("http") ? m[1] : new URL(m[1], baseUrl).toString(),
    })
  }
  const byToken = new Map()
  for (const s of swatches) {
    if (!byToken.has(s.token)) byToken.set(s.token, s)
  }
  return [...byToken.values()]
}

function galleryUrlsFromHtml(html) {
  const urls = []
  const re = /href="(https:\/\/woodright\.ru\/images\/detailed\/(?:9|10|11)\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi
  let m
  while ((m = re.exec(html))) {
    const u = m[1]
    if (!/sizes\d|габарит|наполнение|noliver_var|bedroom|wideheader|View0/i.test(u)) {
      if (!urls.includes(u)) urls.push(u)
    }
  }
  return urls
}

function bucketGalleryByToken(urls) {
  const buckets = new Map()
  for (const url of urls) {
    const file = url.split("/").pop() ?? ""
    if (!/greenwich/i.test(file)) continue
    const token = tokenFromFilename(file)
    if (!token) continue
    const arr = buckets.get(token) ?? []
    arr.push(url)
    buckets.set(token, arr)
  }
  return buckets
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
}

function localName(sku, remoteUrl) {
  const base = remoteUrl.split("/").pop() ?? "image.jpg"
  return `${sku}_${base}`
}

function publicUrl(localName) {
  return `/static/products/greenwich/${localName}`
}

async function importSku(entry) {
  const { handle, sku, workbook_row_key, canonical_name, source_url } = entry
  process.stdout.write(`\n=== ${handle} (${source_url}) ===\n`)

  const baseHtml = await fetchHtml(source_url)
  const swatches = parseSwatches(baseHtml, source_url)
  const baseGallery = galleryUrlsFromHtml(baseHtml)
  const baseBuckets = bucketGalleryByToken(baseGallery)

  const executions = []
  const allPublic = []
  const labels = {}

  const tokensSeen = new Set()

  async function ingestToken(token, label, galleryRemote) {
    if (!token || tokensSeen.has(token)) return
    tokensSeen.add(token)
    const localUrls = []
    for (const remote of galleryRemote) {
      const name = localName(sku, remote)
      const dest = path.join(STATIC_DIR, name)
      if (!fs.existsSync(dest)) {
        process.stdout.write(`  download ${name}\n`)
        await download(remote, dest)
      }
      const pub = publicUrl(name)
      localUrls.push(pub)
      if (!allPublic.includes(pub)) allPublic.push(pub)
    }
    if (localUrls.length === 0) return
    labels[token] = label
    executions.push({ key: token, label, urls: localUrls })
  }

  for (const sw of swatches) {
    const html = await fetchHtml(sw.page_url)
    let gallery = galleryUrlsFromHtml(html)
    if (gallery.length === 0) {
      gallery = baseBuckets.get(sw.token) ?? []
    }
    await ingestToken(sw.token, sw.label, gallery)
  }

  for (const [token, urls] of baseBuckets.entries()) {
    if (tokensSeen.has(token)) continue
    const label =
      swatches.find((s) => s.token === token)?.label ??
      Object.entries(LABEL_TOKEN).find(([, t]) => t === token)?.[0] ??
      token
    await ingestToken(token, label.charAt(0).toUpperCase() + label.slice(1), urls)
  }

  if (executions.length < 2) {
    throw new Error(`${handle}: expected >=2 color executions, got ${executions.length}`)
  }

  const thumb =
    executions.find((e) => e.key === "green")?.urls[0] ??
    executions.find((e) => e.key === "capuchino")?.urls[0] ??
    executions[0]?.urls[0]

  const manifest = {
    handle,
    workbook_row_key,
    canonical_name,
    source_url,
    finish_color_labels: labels,
    finish_color_executions: executions.map((e) => ({
      key: e.key,
      label: e.label,
      urls: e.urls,
    })),
    thumbnail_url: thumb,
    gallery_urls: allPublic,
    imported_at: new Date().toISOString(),
  }

  fs.mkdirSync(MANIFEST_DIR, { recursive: true })
  const outPath = path.join(MANIFEST_DIR, `${handle}.json`)
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2))
  process.stdout.write(
    `manifest ${outPath}: ${executions.length} colors, ${allPublic.length} images\n`
  )
  return manifest
}

function writeFetchSummary(results) {
  fs.writeFileSync(
    path.join(HERE, "fetch-summary.json"),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2)
  )
}

function refreshSummaryFromManifests() {
  const files = fs
    .readdirSync(MANIFEST_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
  const results = files.map((f) => {
    const m = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), "utf8"))
    return {
      handle: m.handle ?? f.replace(/\.json$/, ""),
      ok: true,
      colors: Array.isArray(m.finish_color_executions) ? m.finish_color_executions.length : 0,
      imported_at: m.imported_at ?? null,
    }
  })
  writeFetchSummary(results)
  process.stdout.write(`fetch-summary.json refreshed from ${results.length} manifest(s)\n`)
}

async function main() {
  if (process.argv.includes("--summary-only")) {
    if (!fs.existsSync(MANIFEST_DIR)) {
      console.error(`Missing manifests dir: ${MANIFEST_DIR}`)
      process.exit(1)
    }
    refreshSummaryFromManifests()
    return
  }

  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"))
  const list =
    wanted.length > 0
      ? REGISTRY.filter((e) => wanted.includes(e.handle))
      : REGISTRY

  if (list.length === 0) {
    console.error("No matching handles in sku-registry.json")
    process.exit(1)
  }

  const summary = []
  for (const entry of list) {
    try {
      const m = await importSku(entry)
      summary.push({ handle: entry.handle, ok: true, colors: m.finish_color_executions.length })
    } catch (e) {
      console.error(`FAIL ${entry.handle}:`, e.message)
      summary.push({ handle: entry.handle, ok: false, error: String(e.message) })
    }
  }

  writeFetchSummary(summary)
  const failed = summary.filter((s) => !s.ok)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
