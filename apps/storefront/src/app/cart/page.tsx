import type { Metadata } from "next"
import { CartSummary } from "@/components/cart-summary"
import { cartCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: cartCopy.title,
  description: "Ваша корзина Woodright",
  robots: { index: false, follow: false },
}

export default function CartPage() {
  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{cartCopy.title}</h1>
        <CopyLines className="bespoke-request-lead" lines={cartCopy.lead} />
      </div>

      <CartSummary />
    </div>
  )
}
