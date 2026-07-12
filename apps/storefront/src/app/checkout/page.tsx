import type { Metadata } from "next"
import { CheckoutForm } from "@/components/checkout-form"
import { checkoutCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: checkoutCopy.title,
  description: "Оформление заказа Woodright",
  robots: { index: false, follow: false },
}

export default function CheckoutPage() {
  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{checkoutCopy.title}</h1>
        <CopyLines className="bespoke-request-lead" lines={checkoutCopy.lead} />
        <CopyLines
          className="checkout-payment-clarity checkout-payment-clarity-page"
          lines={checkoutCopy.paymentClarity}
        />
      </div>

      <CheckoutForm />
    </div>
  )
}
