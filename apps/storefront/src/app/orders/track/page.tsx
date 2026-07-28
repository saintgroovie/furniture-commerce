import { Suspense } from "react"
import { OrderTrackClient } from "./order-track-client"
import { orderTrackCopy } from "@/lib/woodright-copy"

export const metadata = {
  title: orderTrackCopy.title,
  robots: { index: false, follow: false },
}

export default function OrderTrackPage() {
  return (
    <main className="page">
      <div className="page-inner">
        <h1>{orderTrackCopy.title}</h1>
        <Suspense fallback={<p className="info-text">{orderTrackCopy.loading}</p>}>
          <OrderTrackClient />
        </Suspense>
      </div>
    </main>
  )
}
