import { describe, expect, it } from "vitest"
import {
  analyzeProductThumbnailHealth,
  canonicalizeMedusaImageUrl,
  medusaImageUrlsEquivalent,
  resolveCanonicalProductThumbnailForWrite,
  resolveEffectiveThumbnail,
} from "./product-thumbnail"

describe("canonicalizeMedusaImageUrl", () => {
  it("strips localhost absolute to relative static path", () => {
    expect(
      canonicalizeMedusaImageUrl(
        "http://localhost:9000/static/products/provence/PV-05-2_gallery_01.jpg"
      )
    ).toBe("/static/products/provence/PV-05-2_gallery_01.jpg")
  })

  it("keeps relative static paths", () => {
    expect(canonicalizeMedusaImageUrl("/static/products/co/CO-02-1.jpg")).toBe(
      "/static/products/co/CO-02-1.jpg"
    )
  })
})

describe("medusaImageUrlsEquivalent", () => {
  it("matches absolute and relative forms", () => {
    expect(
      medusaImageUrlsEquivalent(
        "http://localhost:9000/static/products/oliver/x.jpg",
        "/static/products/oliver/x.jpg"
      )
    ).toBe(true)
  })
})

describe("resolveEffectiveThumbnail", () => {
  it("falls back to first gallery image", () => {
    const product = {
      thumbnail: null,
      images: [{ url: "/static/products/a/1.jpg" }, { url: "/static/products/a/2.jpg" }],
    }
    expect(resolveEffectiveThumbnail(product)).toBe("/static/products/a/1.jpg")
  })

  it("prefers stored thumbnail", () => {
    const product = {
      thumbnail: "http://localhost:9000/static/products/a/thumb.jpg",
      images: [{ url: "/static/products/a/1.jpg" }],
    }
    expect(resolveEffectiveThumbnail(product)).toBe("/static/products/a/thumb.jpg")
  })
})

describe("analyzeProductThumbnailHealth", () => {
  it("flags missing thumbnail with gallery", () => {
    const health = analyzeProductThumbnailHealth({
      thumbnail: null,
      images: [{ url: "/static/products/x/1.jpg" }],
    })
    expect(health.issues.some((i) => i.code === "thumbnail_missing_but_gallery_present")).toBe(
      true
    )
    expect(health.issues[0]?.suggested_thumbnail).toBe("/static/products/x/1.jpg")
  })

  it("flags localhost absolute thumbnail", () => {
    const health = analyzeProductThumbnailHealth({
      thumbnail: "http://localhost:9000/static/products/x/1.jpg",
      images: [{ url: "/static/products/x/1.jpg" }],
    })
    expect(health.issues.some((i) => i.code === "thumbnail_localhost_absolute")).toBe(true)
  })
})

describe("resolveCanonicalProductThumbnailForWrite", () => {
  it("normalizes localhost absolute to relative", () => {
    const product = {
      thumbnail: "http://localhost:9000/static/products/x/1.jpg",
      images: [{ url: "/static/products/x/1.jpg" }],
    }
    expect(resolveCanonicalProductThumbnailForWrite(product)).toBe(
      "/static/products/x/1.jpg"
    )
  })

  it("uses gallery when thumbnail empty", () => {
    const product = {
      images: [{ url: "/static/products/x/hero.jpg" }],
    }
    expect(resolveCanonicalProductThumbnailForWrite(product)).toBe(
      "/static/products/x/hero.jpg"
    )
  })
})
