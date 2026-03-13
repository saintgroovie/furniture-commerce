import Link from "next/link"
import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import { getProduct, NOT_FOUND } from "@/lib/api/products"
import { ProductCta } from "@/components/product-cta"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
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
        <div data-state="not_found">
          <p>Товар не найден.</p>
          <p><Link href="/catalog">В каталог</Link></p>
        </div>
      )
    }
    return (
      <div data-state="error">
        <p>Не удалось загрузить товар.</p>
        <p><Link href="/catalog">В каталог</Link></p>
      </div>
    )
  }
  if (!product) {
    return (
      <div data-state="not_found">
        <p>Товар не найден.</p>
        <p><Link href="/catalog">В каталог</Link></p>
      </div>
    )
  }
  const base = getSiteUrl()
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: (product.title as string) ?? "Товар",
    description: product.description ? String(product.description) : undefined,
    url: `${base}/product/${params.id}`,
    ...((product.images as Array<{ url?: string }>)?.[0]?.url && {
      image: (product.images as Array<{ url: string }>)[0].url,
    }),
  }
  return (
    <div data-state="success">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <h1>{(product.title as string) ?? "Товар"}</h1>
      <p>{String(product.description ?? "")}</p>
      <ProductCta product={product} />
    </div>
  )
}
