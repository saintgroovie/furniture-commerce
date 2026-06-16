"use client"

import { useEffect, useState } from "react"
import type { CardColorVariant } from "./card-color-media"
import {
  sampleDominantColorFromImageUrl,
  type SampledSwatch,
} from "./swatch-color-sampler"

export function useSwatchColors(
  colorVariants: CardColorVariant[] | undefined
): Map<string, SampledSwatch> {
  const [samples, setSamples] = useState<Map<string, SampledSwatch>>(
    () => new Map()
  )

  const variantKey = colorVariants
    ?.map((v) => `${v.key}\u0001${v.mainSrc}\u0001${v.swatchToken ?? ""}`)
    .join("\u0002")

  useEffect(() => {
    if (!colorVariants || colorVariants.length <= 1) {
      setSamples(new Map())
      return
    }

    let cancelled = false
    const run = async () => {
      const next = new Map<string, SampledSwatch>()
      await Promise.all(
        colorVariants.map(async (variant) => {
          const src = variant.mainSrc?.trim()
          if (!src) return
          const sampled = await sampleDominantColorFromImageUrl(
            src,
            variant.swatchToken
          )
          if (!cancelled) next.set(variant.key, sampled)
        })
      )
      if (!cancelled) setSamples(next)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [variantKey, colorVariants])

  return samples
}
