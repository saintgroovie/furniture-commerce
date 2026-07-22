#!/usr/bin/env node

/**
 * Media classification for auto-defer.
 * Only confirmed_no_image may auto-defer.
 */
function classifyMedia(row) {
  const images = normalizeImages(row)
  const binding = row.media_binding || row.media_status || null

  if (binding === "ambiguous" || binding === "ambiguous_media_binding") {
    return {
      status: "ambiguous_media_binding",
      auto_defer_allowed: false,
      checks: ["binding_flag_ambiguous"],
      image_count: images.length,
      preview_url: images[0] || null,
    }
  }

  if (row.confirmed_no_image === true && images.length === 0) {
    return {
      status: "confirmed_no_image",
      auto_defer_allowed: true,
      checks: (row.media_enrichment && row.media_enrichment.checks) || ["confirmed_no_image_flag"],
      image_count: 0,
      preview_url: null,
      defer_reason: "Изображения пока не найдены",
    }
  }

  if (row.has_confirmed_image === true && images.length > 0) {
    return {
      status: "media_present",
      auto_defer_allowed: false,
      checks: (row.media_enrichment && row.media_enrichment.checks) || ["confirmed_image"],
      image_count: images.length,
      preview_url: images[0],
    }
  }

  if (images.length === 0) {
    // Missing image fields without confirmation → do not auto-defer
    return {
      status: "media_url_unavailable",
      auto_defer_allowed: false,
      checks: ["empty_images_unconfirmed"],
      image_count: 0,
      preview_url: null,
    }
  }

  const first = images[0]
  if (typeof first === "string" && (first.includes("broken") || first.includes("404"))) {
    return {
      status: "broken_media",
      auto_defer_allowed: false,
      checks: ["broken_marker"],
      image_count: images.length,
      preview_url: first,
    }
  }

  return {
    status: "media_present",
    auto_defer_allowed: false,
    checks: ["image_url_present"],
    image_count: images.length,
    preview_url: first,
  }
}

function normalizeImages(row) {
  const out = []
  if (Array.isArray(row.images)) {
    for (const img of row.images) {
      if (typeof img === "string") out.push(img)
      else if (img && img.url) out.push(img.url)
    }
  }
  if (row.thumbnail) out.push(row.thumbnail)
  if (row.image_url) out.push(row.image_url)
  if (row.primary_image) out.push(row.primary_image)
  if (row.media && Array.isArray(row.media)) {
    for (const m of row.media) {
      if (typeof m === "string") out.push(m)
      else if (m && m.url) out.push(m.url)
    }
  }
  return [...new Set(out.filter(Boolean))]
}

module.exports = { classifyMedia, normalizeImages }
