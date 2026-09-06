import Link from "next/link"
import type { Metadata } from "next"
import { cache } from "react"
import { getSiteUrl } from "@/lib/api/base"
import { getRoomSetStorefrontBySlug, NOT_FOUND } from "@/lib/api/room-sets"
import { RoomSetCta } from "@/components/room-set-cta"
import { CopyLines } from "@/components/copy-lines"
import { indexingCanonical } from "@/lib/indexing-policy"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import {
  roomSetProductLinkAriaLabel,
  roomSetProductThumbAlt,
} from "@/lib/room-set-item-a11y"
import { roomSetDetail } from "@/lib/woodright-copy"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
}

type RoomProduct = {
  id?: string
  title?: string
  handle?: string
  thumbnail?: string | null
}

type RoomItem = {
  id?: string
  quantity?: number
  sort_order?: number
  product?: RoomProduct
}

const loadRoomSet = cache(async (slug: string) => getRoomSetStorefrontBySlug(slug))

function productHref(product: RoomProduct | undefined): string | null {
  const handle = typeof product?.handle === "string" ? product.handle.trim() : ""
  if (!handle) return null
  return `/product/${encodeURIComponent(handle)}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const base = getSiteUrl()
  const selfCanonical = indexingCanonical(`${base}/rooms/${slug}`)
  try {
    const data = await loadRoomSet(slug)
    const roomSet = data.room_set
    if (!roomSet) {
      return { title: "Комплект", ...(selfCanonical ? { alternates: selfCanonical } : {}) }
    }
    const title = String(roomSet.title ?? "Комплект")
    const desc = roomSet.description ? truncate(String(roomSet.description), 160) : `Готовый комплект мебели: ${title}.`
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        url: `/rooms/${slug}`,
      },
      ...(selfCanonical ? { alternates: selfCanonical } : {}),
    }
  } catch {
    return { title: "Комплект", ...(selfCanonical ? { alternates: selfCanonical } : {}) }
  }
}

export default async function RoomSetPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let data: { room_set?: Record<string, unknown> } = {}
  try {
    data = await loadRoomSet(slug)
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      return (
        <div data-state="not_found">
          <p>{roomSetDetail.notFound}</p>
          <p>
            <Link href="/rooms">К списку комнат</Link>
          </p>
        </div>
      )
    }
    return (
      <div data-state="error">
        <CopyLines lines={roomSetDetail.loadError} />
        <p>
          <Link href="/rooms">К списку комнат</Link>
        </p>
      </div>
    )
  }
  const roomSet = data.room_set
  if (!roomSet) {
    return (
      <div data-state="not_found">
        <p>{roomSetDetail.notFound}</p>
        <p>
          <Link href="/rooms">К списку комнат</Link>
        </p>
      </div>
    )
  }
  const items = ((roomSet.items as RoomItem[]) ?? []).slice().sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )
  const hero =
    typeof roomSet.hero_image === "string" && roomSet.hero_image.trim()
      ? roomSet.hero_image.trim()
      : null

  return (
    <div className="room-set-detail" data-state="success">
      {hero ? (
        <img
          src={hero}
          alt={String(roomSet.title ?? "Комната")}
          className="room-set-hero-img"
        />
      ) : null}
      <div className="room-set-detail-header">
        <h1>{(roomSet.title as string) ?? "Комната"}</h1>
        <p>{String(roomSet.description ?? "")}</p>
        <p className="price room-set-detail-price">
          {roomSetDetail.priceFromLabel}:{" "}
          {roomSet.price_from != null ? String(roomSet.price_from) : roomSetDetail.priceUnknown}
        </p>
      </div>
      <h2 style={{ marginTop: "0.5rem" }}>{roomSetDetail.compositionTitle}</h2>
      <ul className="room-set-items">
        {items.map((item, i) => {
          const product = item.product
          const title = String(product?.title ?? "Товар")
          const qty = Number(item.quantity ?? 1)
          const href = productHref(product)
          const thumbRaw =
            typeof product?.thumbnail === "string" && product.thumbnail.trim()
              ? product.thumbnail.trim()
              : null
          // Buyer-facing media must go through the same resolver as catalog/PDP
          // (`/static/...` → `/product-static/...` via Next rewrite). Raw `/static/`
          // on the storefront origin 404s.
          const thumb = thumbRaw
            ? resolveStorefrontProductImageSrc(thumbRaw)
            : null
          const key = String(item.id ?? product?.id ?? i)

          if (!href) {
            return (
              <li key={key} className="room-set-item" data-pdp-link="missing">
                <span className="room-set-item-title">{title}</span>
                <span className="room-set-item-qty">× {qty}</span>
              </li>
            )
          }

          // One accessible link for the whole row — no nested interactive elements.
          // Pattern A: aria-label supplies the concise accessible name; thumb alt
          // uses the buyer-facing title (never SKU/id). Visible title stays for UI.
          return (
            <li key={key} className="room-set-item" data-pdp-link="ok">
              <Link
                href={href}
                className="room-set-item-link"
                data-product-handle={product?.handle}
                aria-label={roomSetProductLinkAriaLabel(title)}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={roomSetProductThumbAlt(title)}
                    className="room-set-item-thumb"
                    loading="lazy"
                  />
                ) : (
                  <span className="room-set-item-thumb room-set-item-thumb-placeholder" aria-hidden="true" />
                )}
                <span className="room-set-item-main">
                  <span className="room-set-item-title">{title}</span>
                  <span className="room-set-item-open">{roomSetDetail.openProduct}</span>
                </span>
                <span className="room-set-item-qty">× {qty}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <RoomSetCta roomSet={roomSet} />
    </div>
  )
}
