import type { Metadata } from "next"
import { CartSummary } from "@/components/cart-summary"
import { cartCopy } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: cartCopy.title,
  description: "Ваша корзина Woodright.",
  robots: { index: false, follow: false },
}

export default function CartPage() {
  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{cartCopy.title}</h1>
        <p className="bespoke-request-lead">
          {cartCopy.lead[0]}
          <br />
          {cartCopy.lead[1]}
        </p>
      </div>

      <CartSummary />
    </div>
  )
}
