"use client"

import { useEffect, useRef, useState } from "react"
import type { CardColorVariant } from "./card-color-media"
import {
  sampleDominantColorFromImageUrl,
  type SampledSwatch,
} from "./swatch-color-sampler"

function normalizeSampleUrl(url: string): string {
  const t = url.trim()
  const m = t.match(/\/static\/products\/.+$/i)
  return m ? m[0]! : t
}

function sampleRank(sample: SampledSwatch): number {
  if (sample.source === "image_sampled") {
    if (sample.confidence === "high") return 4
    if (sample.confidence === "medium") return 3
    return 2
  }
  if (sample.source === "metadata") return 3
  return 1
}

function buildVariantKey(colorVariants: CardColorVariant[]): string {
  return colorVariants
    .map(
      (v) =>
        `${v.key}\u0001${normalizeSampleUrl(v.mainSrc ?? "")}\u0001${v.swatchToken ?? ""}\u0001${v.swatchSampleRegion ?? "default"}\u0001${v.swatchHex ?? ""}`
    )
    .join("\u0002")
}

function metadataOnlySamples(
  colorVariants: CardColorVariant[]
): Map<string, SampledSwatch> {
  const out = new Map<string, SampledSwatch>()
  for (const variant of colorVariants) {
    const metadataHex = variant.swatchHex?.trim()
    if (!metadataHex) continue
    const src = variant.mainSrc?.trim()
    out.set(variant.key, {
      source: "metadata",
      color: metadataHex,
      imageUrl: src ? normalizeSampleUrl(src) : undefined,
      confidence: "high",
    })
  }
  return out
}

/** Exported for fidelity tests (PERF-04 gate: metadata without image sampling). */
export function buildMetadataOnlySwatchSamples(
  colorVariants: CardColorVariant[]
): Map<string, SampledSwatch> {
  return metadataOnlySamples(colorVariants)
}

export type UseSwatchColorsOptions = {
  /**
   * When false, only metadata `swatchHex` is applied (no image/canvas sampling).
   * Catalog cards gate this with IntersectionObserver / pointerenter (PERF-04).
   * Omit or true for PDP (immediate sampling).
   */
  enabled?: boolean
}

export function useSwatchColors(
  colorVariants: CardColorVariant[] | undefined,
  options?: UseSwatchColorsOptions
): Map<string, SampledSwatch> {
  const enabled = options?.enabled !== false
  const [samples, setSamples] = useState<Map<string, SampledSwatch>>(
    () => new Map()
  )
  const variantsRef = useRef(colorVariants)
  variantsRef.current = colorVariants

  const variantKey =
    colorVariants && colorVariants.length > 1
      ? buildVariantKey(colorVariants)
      : ""

  // Fast path: metadata hexes are free; apply even when image sampling is gated off.
  useEffect(() => {
    const colorVariants = variantsRef.current
    if (!colorVariants || colorVariants.length <= 1 || !variantKey) {
      setSamples(new Map())
      return
    }
    if (!enabled) {
      setSamples(metadataOnlySamples(colorVariants))
      return
    }

    let cancelled = false
    const validKeys = new Set(colorVariants.map((v) => v.key))

    const run = async () => {
      const pending = new Map<string, SampledSwatch>()
      await Promise.all(
        colorVariants.map(async (variant) => {
          const metadataHex = variant.swatchHex?.trim()
          if (metadataHex) {
            const src = variant.mainSrc?.trim()
            pending.set(variant.key, {
              source: "metadata",
              color: metadataHex,
              imageUrl: src ? normalizeSampleUrl(src) : undefined,
              confidence: "high",
            })
            return
          }
          const src = variant.mainSrc?.trim()
          if (!src) return
          const sampled = await sampleDominantColorFromImageUrl(
            src,
            variant.swatchToken,
            variant.swatchSampleRegion ?? "default"
          )
          pending.set(variant.key, {
            ...sampled,
            imageUrl: normalizeSampleUrl(sampled.imageUrl ?? src),
          })
        })
      )

      if (cancelled) return

      setSamples((prev) => {
        const merged = new Map<string, SampledSwatch>()
        for (const key of Array.from(validKeys)) {
          const variant = colorVariants.find((v) => v.key === key)
          const metadataHex = variant?.swatchHex?.trim()
          if (metadataHex) {
            const src = normalizeSampleUrl(variant?.mainSrc ?? "")
            merged.set(key, {
              source: "metadata",
              color: metadataHex,
              imageUrl: src || undefined,
              confidence: "high",
            })
            continue
          }
          const src = normalizeSampleUrl(variant?.mainSrc ?? "")
          const prevSample = prev.get(key)
          if (
            prevSample &&
            prevSample.source === "image_sampled" &&
            normalizeSampleUrl(prevSample.imageUrl ?? "") === src
          ) {
            merged.set(key, prevSample)
          }
        }
        for (const [key, sample] of Array.from(pending)) {
          const existing = merged.get(key)
          if (!existing || sampleRank(sample) >= sampleRank(existing)) {
            merged.set(key, sample)
          }
        }
        return merged
      })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [variantKey, enabled])

  return samples
}
