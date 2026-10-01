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

export type MediaOrderDecision =
  | { ok: true; images: ProductImage[] }
  | { ok: false; message: string }

/** Move one attached frame. Does not delete a file or change hero by itself. */
export function decideMove(
  images: ProductImage[],
  url: string,
  direction: "up" | "down"
): MediaOrderDecision {
  const index = images.findIndex((image) => image.url === url)
  if (index < 0) return { ok: false, message: "Этот кадр не привязан к товару" }
  const nextIndex = direction === "up" ? index - 1 : index + 1
  if (nextIndex < 0 || nextIndex >= images.length) {
    return { ok: false, message: direction === "up" ? "Кадр уже первый" : "Кадр уже последний" }
  }
  const next = images.slice()
  const current = next[index]
  const swap = next[nextIndex]
  if (!current || !swap) return { ok: false, message: "Этот кадр не привязан к товару" }
  next[index] = swap
  next[nextIndex] = current
  return { ok: true, images: next }
}

export type DetachDecision =
  | { ok: true; images: ProductImage[]; thumbnail: string | null }
  | { ok: false; message: string }

/** Unlink a frame from the product. The file stays. Hero is cleared only if it was this frame. */
export function decideDetach(
  images: ProductImage[],
  thumbnail: string | null,
  url: string
): DetachDecision {
  const match = images.find((image) => image.url === url)
  if (!match) return { ok: false, message: "Этот кадр не привязан к товару" }
  return {
    ok: true,
    images: images.filter((image) => image.url !== url),
    thumbnail: thumbnail === url ? null : thumbnail,
  }
}
