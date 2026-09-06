import { Navigate } from "react-router-dom"

/** Legacy SKU prototype now routes to the seller product list. */
const WoodrightSkuRedirect = () => {
  return <Navigate to="/woodright/products" replace />
}

export default WoodrightSkuRedirect
