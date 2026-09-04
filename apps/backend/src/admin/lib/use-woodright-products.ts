import { useCallback, useEffect, useState } from "react"
import { adminJson, sellerErrorMessage } from "./admin-fetch"
import type { WoodrightProductsResponse } from "../../lib/woodright-admin/seller-product-types"

export function useWoodrightProducts() {
  const [data, setData] = useState<WoodrightProductsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const json = await adminJson<WoodrightProductsResponse>("/admin/woodright/products")
      setData(json)
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить товары"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}
