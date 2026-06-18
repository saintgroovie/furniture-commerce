#!/usr/bin/env node
/**
 * Scrape Консоль Step (woodright.ru) color swatches + per-color gallery; download to static.
 * Output: manifest.json + files under apps/backend/static/products/greenwich/
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = path.join(ROOT, "apps/backend/static/products/greenwich")
const BASE_URL = "https://woodright.ru/kollekcii/greenwich/konsol-step/"
const UA = "Mozilla/5.0 (Woodright import)"

const COLORS = [
  { variation_id: "1449", label: "Белый G503", token: "white", image: "greenwich_white07_0ehl-bq.jpg" },
  { variation_id: "1451", label: "Графит S499", token: "graphite", image: "greenwich_graphite07_cmwj-2w.jpg" },
  { variation_id: null, label: "Изумруд М442", token: "green", image: "greenwich_green07_d5hh-4j.jpg" },
  { variation_id: "1453", label: "Какао L481", token: "cacao", image: "greenwich_cacao07_60f5-48.jpg" },
  { variation_id: "449", label: "Капучино J481", token: "capuchino", image: "greenwich_capuchino07.jpg" },
  { variation_id: "1458", label: "Олива K447", token: "olive", image: "greenwich_olive07_9p92-33.jpg" },
  { variation_id: "1454", label: "Пудра Н469", token: "powder", image: "greenwich_powder07_8lbj-u5.jpg" },
  { variation_id: "1456", label: "Серо-голубой K500", token: "grey-blue", image: "greenwich_grey-blue07_pnyh-yd.jpg" },
  { variation_id: "1452", label: "Серый J499", token: "grey", image: "greenwich_grey07_fnfs-n0.jpg" },
  { variation_id: "1455", label: "Син-серый N436", token: "darkblue", image: "greenwich_darkblue07_tynd-0c.jpg" },
  { variation_id: "1459", label: "Сливочный F398", token: "cream", image: "greenwich_cream07_9nls-zz.jpg" },
  { variation_id: "1450", label: "Терракота M476", token: "terracote", image: "greenwich_terracote07_suda-hi.jpg" },
]

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

function galleryUrlsFromHtml(html) {
  const urls = []
  const re = /href="(https:\/\/woodright\.ru\/images\/detailed\/(?:10|11)\/greenwich[^"]+\.jpg)"/gi
  let m
  while ((m = re.exec(html))) {
    if (!urls.includes(m[1])) urls.push(m[1])
  }
  return urls
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  return dest
}

function localNameFromUrl(url) {
  const base = url.split("/").pop() ?? "image.jpg"
  return `GR-44-1_${base}`
}

function publicUrl(localName) {
  return `/static/products/greenwich/${localName}`
}

async function main() {
  const executions = []
  const allUrls = []

  for (const color of COLORS) {
    const pageUrl = color.variation_id
      ? `${BASE_URL}?variation_id=${color.variation_id}`
      : BASE_URL
    const html = await fetchHtml(pageUrl)
    let gallery = galleryUrlsFromHtml(html)
    if (gallery.length === 0 && color.image) {
      gallery = [`https://woodright.ru/images/detailed/11/${color.image}`]
    }
    const localUrls = []
    for (const remote of gallery) {
      const localName = localNameFromUrl(remote)
      const dest = path.join(STATIC_DIR, localName)
      if (!fs.existsSync(dest)) {
        process.stdout.write(`download ${localName}\n`)
        await download(remote, dest)
      } else {
        process.stdout.write(`skip exists ${localName}\n`)
      }
      const pub = publicUrl(localName)
      localUrls.push(pub)
      allUrls.push(pub)
    }
    executions.push({
      key: color.token,
      label: color.label,
      urls: localUrls,
      woodright_variation_id: color.variation_id,
    })
  }

  const thumb = executions.find((e) => e.key === "green")?.urls[0] ?? executions[0]?.urls[0]
  const manifest = {
    handle: "greenwich-gr-44-1",
    product_id: "prod_01KM1QHNHNR5R4YZKQERDE8EZ6",
    workbook_row_key: "greenwich:GR-44-1",
    canonical_name: "Консоль Step",
    source_url: BASE_URL,
    finish_color_labels: Object.fromEntries(executions.map((e) => [e.key, e.label])),
    finish_color_executions: executions.map((e) => ({
      key: e.key,
      label: e.label,
      urls: e.urls,
    })),
    thumbnail_url: thumb,
    gallery_urls: [...new Set(allUrls)],
    imported_at: new Date().toISOString(),
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2))
  console.log(`manifest: ${executions.length} colors, ${manifest.gallery_urls.length} images`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
