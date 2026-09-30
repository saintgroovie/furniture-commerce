export type ProductImage = { id: string; url: string }

export type HeroDecision =
  | { ok: true; thumbnail: string; previous: string | null }
  | { ok: false; message: string }

/** Hero is an existing product image. Status and files stay untouched. */
export function decideHeroThumbnail(
  images: ProductImage[],
  thumbnail: string | null,
  url: string
): HeroDecision {
  const match = images.find((image) => image.url === url)
  if (!match) {
    return { ok: false, message: "Этот кадр не привязан к товару" }
  }
  return { ok: true, thumbnail: match.url, previous: thumbnail }
}
