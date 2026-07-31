import type { Metadata } from "next"
import { cookies } from "next/headers"
import { CartSummary } from "@/components/cart-summary"
import { CART_ID_COOKIE } from "@/lib/cart/cart-cookie"
import { cartCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: cartCopy.title,
  description: "Ваша корзина Woodright",
  robots: { index: false, follow: false },
}

export default async function CartPage() {
  /* Cart payload is client-fetched (cookie + Medusa). Without a cart_id cookie
     SSR must not claim «Загружаем…» — show empty immediately. With a cookie,
     keep a short loading shell until getCart resolves. */
  const jar = await cookies()
  const hasCartCookie = Boolean(jar.get(CART_ID_COOKIE)?.value?.trim())

  return (
    <div className="bespoke-request-page">
      <div className="bespoke-request-header">
        <h1>{cartCopy.title}</h1>
        <CopyLines className="bespoke-request-lead" lines={cartCopy.lead} />
      </div>

      <CartSummary initialViewState={hasCartCookie ? "loading" : "empty"} />
    </div>
  )
}
