import type { PodiumFrame } from "@/lib/showroom-podium-media"

type Props = {
  frame: PodiumFrame
  sizes: string
  priority?: boolean
}

/**
 * Static AVIF/WebP pair. No runtime image optimizer: the storefront already
 * serves `public/` as-is, and these files are pre-sized for that path.
 */
export function ContactsPodiumPhoto({ frame, sizes, priority = false }: Props) {
  const avif = `${frame.smallAvif} ${frame.smallWidth}w, ${frame.avif} ${frame.width}w`
  const webp = `${frame.smallWebp} ${frame.smallWidth}w, ${frame.webp} ${frame.width}w`

  return (
    <picture>
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      <source type="image/webp" srcSet={webp} sizes={sizes} />
      <img
        src={frame.webp}
        alt={frame.alt}
        width={frame.width}
        height={frame.height}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  )
}
