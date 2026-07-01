import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { useEffect, useState } from "react"
import type { SiteReadinessResponse } from "../../lib/woodright-admin/site-readiness"
import { WoodrightSiteStatusPanel } from "../components/woodright/WoodrightSiteStatusPanel"

const WoodrightProductSiteStatusWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const [summary, setSummary] = useState<SiteReadinessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/admin/woodright/products/${data.id}/site-readiness`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text()
          throw new Error(body || `HTTP ${res.status}`)
        }
        return res.json() as Promise<SiteReadinessResponse>
      })
      .then((json) => {
        if (!cancelled) setSummary(json)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить статус на сайте")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [data.id])

  return (
    <WoodrightSiteStatusPanel
      data={summary}
      loading={loading}
      error={error}
      rawMetadata={data.metadata ?? undefined}
    />
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default WoodrightProductSiteStatusWidget
