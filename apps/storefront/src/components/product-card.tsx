import Link from "next/link"

type Variant = {
  id?: string
  calculated_price?: { calculated_amount?: number }
  prices?: Array<{ amount?: number }>
}

type Product = {
  id: string
  title: string
  description?: string
  handle?: string
  thumbnail?: string
  variants?: Variant[]
  custom_product_type?: { product_type?: string }
}

function getPrice(product: Product): number | null {
  const v = product.variants?.[0]
  if (!v) return null
  if (v.calculated_price?.calculated_amount != null) return v.calculated_price.calculated_amount
  if (v.prices?.length && v.prices[0].amount != null) return v.prices[0].amount
  return null
}

function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

export function ProductCard({ product }: { product: Product }) {
  const type = product.custom_product_type?.product_type
  const price = getPrice(product)

  return (
    <div className="card">
      {product.thumbnail && (
        <img
          src={product.thumbnail}
          alt={product.title}
          className="card-img"
        />
      )}
      <div className="card-body">
        <h3>
          <Link href={`/product/${product.id}`}>{product.title}</Link>
        </h3>
        {type && <span className="badge">{type}</span>}
        {price != null && (
          <p className="price" style={{ marginTop: "0.5rem" }}>{formatRub(price)}</p>
        )}
        {product.description && (
          <p className="info-text" style={{ marginTop: "0.5rem" }}>
            {product.description.length > 100
              ? product.description.slice(0, 100).trim() + "…"
              : product.description}
          </p>
        )}
      </div>
    </div>
  )
}
