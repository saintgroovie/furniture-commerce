export type PreviewUrlInput = {
  productId: string
  status?: string | null
  storefrontOrigin?: string | null
  /** Kids placement hint — PDP remains /product/:id in current storefront contract */
  kidsVisible?: boolean
}

export type PreviewUrlView = {
  url: string | null
  label: string
  note: string | null
  disabled: boolean
}

const DEFAULT_ORIGIN = "http://localhost:3002"

/**
 * Canonical storefront PDP is `/product/:id` (not handle) — see storefront product/[id]/page.tsx.
 */
export function buildStorefrontPreviewUrl(input: PreviewUrlInput): PreviewUrlView {
  const id = input.productId?.trim()
  if (!id) {
    return {
      url: null,
      label: "Предпросмотр на витрине",
      note: "Нет ID товара.",
      disabled: true,
    }
  }

  const origin = (input.storefrontOrigin?.trim() || DEFAULT_ORIGIN).replace(/\/$/, "")
  const url = `${origin}/product/${encodeURIComponent(id)}`
  const published = input.status === "published"

  return {
    url,
    label: "Предпросмотр на витрине",
    note: published
      ? input.kidsVisible
        ? "Товар может относиться к детскому каталогу; карточка открывается по /product/:id. Попадание в списки каталога — отдельно."
        : "Прямая ссылка на карточку. Попадание в /catalog зависит от статуса, коллекции и фильтров витрины."
      : "Статус не «Опубликован» — в списках каталога не будет. Прямая ссылка /product/:id на стенде может открываться.",
    disabled: false,
  }
}

export function resolveStorefrontOrigin(
  env: Record<string, string | undefined> = {}
): string {
  const raw =
    env.WOODRIGHT_STOREFRONT_ORIGIN?.trim() ||
    env.VITE_WOODRIGHT_STOREFRONT_ORIGIN?.trim() ||
    DEFAULT_ORIGIN
  return raw.replace(/\/$/, "")
}
