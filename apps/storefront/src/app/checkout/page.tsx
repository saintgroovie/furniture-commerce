import type { Metadata } from "next"
import { CheckoutForm } from "@/components/checkout-form"

export const metadata: Metadata = {
  title: "Оформление заказа",
  description: "Оформление заказа",
  robots: { index: false, follow: false },
}

export default function CheckoutPage() {
  return (
    <div className="service-page">
      <h1>Оформление заказа</h1>
      <CheckoutForm />
    </div>
  )
}
