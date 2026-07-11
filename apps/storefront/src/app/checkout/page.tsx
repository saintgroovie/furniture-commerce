import type { Metadata } from "next"
import { CheckoutForm } from "@/components/checkout-form"
import { checkoutCopy } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: checkoutCopy.title,
  description: "Оформление заказа Woodright.",
  robots: { index: false, follow: false },
}

export default function CheckoutPage() {
  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{checkoutCopy.title}</h1>
        <p className="bespoke-request-lead">
          {checkoutCopy.lead[0]}
          <br />
          {checkoutCopy.lead[1]}
        </p>
      </div>

      <CheckoutForm />
    </div>
  )
}
