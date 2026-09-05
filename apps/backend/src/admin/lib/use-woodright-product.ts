import { useCallback, useEffect, useState } from "react"
import { adminJson, sellerErrorMessage } from "./admin-fetch"
import type { SellerProduct } from "../../lib/woodright-admin/seller-product-types"

type ProductResponse = {
  product: SellerProduct
  site_url: string
}

export function useWoodrightProduct(id: string | undefined) {
  const [product, setProduct] = useState<SellerProduct | null>(null)
  const [siteUrl, setSiteUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const json = await adminJson<ProductResponse>(`/admin/woodright/products/${id}`)
      setProduct(json.product)
      setSiteUrl(json.site_url ?? "")
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить товар"))
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { product, siteUrl, loading, error, reload }
}
