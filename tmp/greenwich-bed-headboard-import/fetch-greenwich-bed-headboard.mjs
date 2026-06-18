#!/usr/bin/env node
/**
 * Greenwich bed headboard + shared GR-BED-POOL media from legacy woodright.ru.
 * Output: manifests/greenwich-bed-pool.json
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "../..")
const STATIC_DIR = path.join(ROOT, "apps/backend/static/products/greenwich/beds-shared")
const LEGACY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/raw/legacy/greenwich-products.json"), "utf8")
)
const REGISTRY = JSON.parse(fs.readFileSync(path.join(HERE, "headboard-registry.json"), "utf8"))
const UA = "Mozilla/5.0 (Woodright Greenwich bed import)"

const BED_HANDLES = [
  "greenwich-gr-09-1-bed-90",
  "greenwich-gr-12-1",
  "greenwich-gr-14-1",
  "greenwich-gr-16-1",
  "greenwich-gr-18-1",
]

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

function galleryUrlsFromHtml(html) {
  const urls = []
  const re = /href="(https:\/\/woodright\.ru\/images\/detailed\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi
  let m
  while ((m = re.exec(html))) {
    const u = m[1]
    if (/sizes\d|габарит/i.test(u)) continue
    if (!urls.includes(u)) urls.push(u)
  }
  return urls
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function poolNameFromUrl(url, key) {
  const base = url.split("/").pop() ?? "image.jpg"
  if (/GR-BED-POOL/i.test(base)) return base
  if (new RegExp(key, "i").test(base)) return `GR-BED-POOL_${key}_${base}`
  return `GR-BED-POOL_${key}_${base}`
}

function publicPoolUrl(name) {
  return `/static/products/greenwich/beds-shared/${name}`
}

async function main() {
  const headboardExecutions = []
  const allPublic = []

  for (const hb of REGISTRY) {
    const legacyEntry = LEGACY.find((e) => e.page_url === hb.source_url)
    const html = await fetchHtml(hb.source_url)
    const fromHtml = galleryUrlsFromHtml(html)
    const fromLegacy = legacyEntry?.all_image_urls ?? []
    const remote = [...new Set([...fromHtml, ...fromLegacy])].filter((u) =>
      /greenwich|noliver|bedroom|wideheader/i.test(u)
    )

    const localUrls = []
    for (const url of remote) {
      const name = poolNameFromUrl(url, hb.legacy_key)
      const dest = path.join(STATIC_DIR, name)
      if (!fs.existsSync(dest)) {
        process.stdout.write(`download ${name}\n`)
        await download(url, dest)
      }
      const pub = publicPoolUrl(name)
      localUrls.push(pub)
      if (!allPublic.includes(pub)) allPublic.push(pub)
    }

    headboardExecutions.push({
      key: hb.legacy_key,
      label: hb.label,
      urls: localUrls,
    })
  }

  // Ensure numbered GR-BED-POOL_* from disk are in gallery
  if (fs.existsSync(STATIC_DIR)) {
    for (const name of fs.readdirSync(STATIC_DIR).sort()) {
      if (!/^GR-BED-POOL_/i.test(name)) continue
      const pub = publicPoolUrl(name)
      if (!allPublic.includes(pub)) allPublic.push(pub)
    }
  }

  const manifest = {
    display_group: "greenwich-bed",
    handles: BED_HANDLES,
    headboard_model_executions: headboardExecutions,
    gallery_urls: allPublic,
    thumbnail_url:
      allPublic.find((u) => u.includes("GR-BED-POOL_frame_01")) ?? allPublic[0],
    imported_at: new Date().toISOString(),
  }

  fs.mkdirSync(path.join(HERE, "manifests"), { recursive: true })
  const out = path.join(HERE, "manifests/greenwich-bed-pool.json")
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2))
  console.log(
    `manifest ${out}: ${headboardExecutions.length} headboards, ${allPublic.length} pool images`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
