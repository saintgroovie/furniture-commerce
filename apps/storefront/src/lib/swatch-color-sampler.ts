import { toSameOriginSampleUrl } from "./swatch-image-url"
import { fallbackHexForToken } from "./swatch-fallback-colors"

export type SampledSwatch = {
  source: "image_sampled" | "fallback_token" | "metadata"
  color: string
  imageUrl?: string
  confidence?: "high" | "medium" | "low"
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
}

function isBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 120) return true
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)
  if (lum > 238 && chroma < 28) return true
  if (lum < 16) return true
  return false
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`load failed: ${url}`))
    img.src = url
  })
}

/**
 * Dominant product/finish color from representative execution image.
 * Uses same-origin `/product-static` rewrite for canvas readback.
 */
export async function sampleDominantColorFromImageUrl(
  imageUrl: string,
  fallbackToken?: string | null
): Promise<SampledSwatch> {
  const sampleUrl = toSameOriginSampleUrl(imageUrl)
  try {
    const img = await loadImage(sampleUrl)
    const size = 48
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("no canvas context")

    const sx = img.width * 0.12
    const sy = img.height * 0.12
    const sw = img.width * 0.76
    const sh = img.height * 0.76
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)

    const data = ctx.getImageData(0, 0, size, size).data
    const bins = new Map<string, { r: number; g: number; b: number; n: number }>()

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!
      if (isBackgroundPixel(r, g, b, a)) continue
      const qr = Math.round(r / 20) * 20
      const qg = Math.round(g / 20) * 20
      const qb = Math.round(b / 20) * 20
      const key = `${qr},${qg},${qb}`
      const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
      bin.r += r
      bin.g += g
      bin.b += b
      bin.n += 1
      bins.set(key, bin)
    }

    let best: { r: number; g: number; b: number; n: number } | null = null
    for (const bin of Array.from(bins.values())) {
      if (!best || bin.n > best.n) best = bin
    }

    if (!best || best.n < 4) {
      return {
        source: "fallback_token",
        color: fallbackHexForToken(fallbackToken),
        imageUrl,
        confidence: "low",
      }
    }

    const r = Math.round(best.r / best.n)
    const g = Math.round(best.g / best.n)
    const b = Math.round(best.b / best.n)
    return {
      source: "image_sampled",
      color: rgbToHex(r, g, b),
      imageUrl,
      confidence: best.n > 100 ? "high" : best.n > 40 ? "medium" : "low",
    }
  } catch {
    return {
      source: "fallback_token",
      color: fallbackHexForToken(fallbackToken),
      imageUrl,
      confidence: "low",
    }
  }
}
