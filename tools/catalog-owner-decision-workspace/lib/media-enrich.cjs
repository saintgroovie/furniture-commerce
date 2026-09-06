#!/usr/bin/env node
const fs = require("fs")

/**
 * Enrich owner rows with read-only media from a products snapshot.
 * Never mutates Medusa; never invents confirmed_no_image without evidence.
 */
function enrichMedia(rows, productsById, publicOrigin = "https://woodright-demo.ru") {
  return rows.map((row) => {
    const p = productsById[row.product_id]
    if (!p) {
      return {
        ...row,
        media_enrichment: {
          status: "product_absent_from_snapshot",
          auto_defer_allowed: false,
        },
        confirmed_no_image: false,
        has_confirmed_image: false,
      }
    }
    const images = []
    if (p.thumbnail) images.push(absolutize(p.thumbnail, publicOrigin))
    for (const img of p.images || []) {
      const url = typeof img === "string" ? img : img && img.url
      if (url) images.push(absolutize(url, publicOrigin))
    }
    const unique = [...new Set(images.filter(Boolean))]
    if (unique.length === 0) {
      return {
        ...row,
        thumbnail: null,
        image_url: null,
        images: [],
        confirmed_no_image: true,
        has_confirmed_image: false,
        media_enrichment: {
          status: "confirmed_no_image",
          source: "products_snapshot",
          checks: ["snapshot_loaded", "thumbnail_absent", "images_absent"],
        },
      }
    }
    return {
      ...row,
      thumbnail: unique[0],
      image_url: unique[0],
      images: unique,
      confirmed_no_image: false,
      has_confirmed_image: true,
      media_enrichment: {
        status: "media_present",
        source: "products_snapshot",
        checks: ["snapshot_loaded", "thumbnail_or_images_present"],
        image_count: unique.length,
      },
    }
  })
}

function absolutize(url, origin) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith("/")) return origin.replace(/\/$/, "") + url
  return origin.replace(/\/$/, "") + "/" + url
}

function loadProductsById(fixturePath) {
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  const list = Array.isArray(raw) ? raw : raw.products || []
  const map = {}
  for (const p of list) {
    if (p && p.id) map[p.id] = p
  }
  return map
}

module.exports = { enrichMedia, loadProductsById, absolutize }
