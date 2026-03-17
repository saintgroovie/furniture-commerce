import Link from "next/link"
import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import { getProduct, NOT_FOUND } from "@/lib/api/products"
import { ProductCta } from "@/components/product-cta"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
}

function getPrice(product: Record<string, unknown>): number | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const v = variants?.[0]
  if (!v) return null
  const cp = v.calculated_price as Record<string, unknown> | undefined
  if (cp?.calculated_amount != null) return Number(cp.calculated_amount)
  const prices = v.prices as Array<Record<string, unknown>> | undefined
  if (prices?.length && prices[0].amount != null) return Number(prices[0].amount)
  return null
}

function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const base = getSiteUrl()
  try {
    const res = await getProduct(params.id)
    const product = res.product as Record<string, unknown> | undefined
    if (!product) return { title: "Товар", alternates: { canonical: `${base}/product/${params.id}` } }
    const title = String(product.title ?? "Товар")
    const desc = product.description ? truncate(String(product.description), 160) : "Товар из каталога Woodright."
    const images = product.images as Array<{ url?: string }> | undefined
    const imageUrl = images?.[0]?.url
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        url: `/product/${params.id}`,
        ...(imageUrl && { images: [imageUrl] }),
      },
      alternates: { canonical: `${base}/product/${params.id}` },
    }
  } catch {
    return { title: "Товар", alternates: { canonical: `${base}/product/${params.id}` } }
  }
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  let product: Record<string, unknown> | null = null
  try {
    const res = await getProduct(params.id)
    product = res.product ?? null
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      return (
        <div data-state="not_found" className="status-message">
          <h1>Товар не найден</h1>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/catalog">В каталог</Link>
          </div>
        </div>
      )
    }
    return (
      <div data-state="error" className="status-message">
        <h1>Ошибка</h1>
        <p>Не удалось загрузить товар.</p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }
  if (!product) {
    return (
      <div data-state="not_found" className="status-message">
        <h1>Товар не найден</h1>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }

  const base = getSiteUrl()
  const thumbnail = product.thumbnail as string | undefined
  const images = product.images as Array<{ url?: string }> | undefined
  const mainImage = thumbnail || images?.[0]?.url
  const price = getPrice(product)
  const productType = (product.custom_product_type as Record<string, string> | undefined)?.product_type

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: (product.title as string) ?? "Товар",
    description: product.description ? String(product.description) : undefined,
    url: `${base}/product/${params.id}`,
    ...(mainImage && { image: mainImage }),
  }

  return (
    <div data-state="success">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <div className="product-detail">
        <div>
          {mainImage ? (
            <img src={mainImage} alt={String(product.title ?? "")} className="product-detail-img" />
          ) : (
            <div className="product-detail-img skeleton" />
          )}
        </div>
        <div className="product-detail-info">
          <div>
            <h1>{(product.title as string) ?? "Товар"}</h1>
            {productType && <span className="badge" style={{ marginTop: "0.5rem", display: "inline-block" }}>{productType}</span>}
          </div>
          {price != null && <p className="price" style={{ fontSize: "1.35rem" }}>{formatRub(price)}</p>}
          {product.description && <p className="info-text">{String(product.description)}</p>}
          <ProductCta product={product} />
        </div>
      </div>
    </div>
  )
}
