import type { Metadata } from "next"
import { CartSummary } from "@/components/cart-summary"

export const metadata: Metadata = {
  title: "Корзина",
  description: "Ваша корзина",
  robots: { index: false, follow: false },
}

export default function CartPage() {
  return (
    <div>
      <h1>Корзина</h1>
      <CartSummary />
    </div>
  )
}
