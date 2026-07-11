import type { Metadata } from "next"
import { CheckoutForm } from "@/components/checkout-form"
import { a1Checkout } from "@/lib/package-a1-copy"

export const metadata: Metadata = {
  title: "Оформление заказа",
  description: "Оформление заказа Woodright",
  robots: { index: false, follow: false },
}

export default function CheckoutPage() {
  return (
    <div>
      <h1>Оформление заказа</h1>
      <p className="checkout-payment-clarity">{a1Checkout.paymentClarity}</p>
      <CheckoutForm />
    </div>
  )
}
