import { permanentRedirect } from "next/navigation"

/**
 * Historical third-catalog URL. Not default IA.
 * Keep the route so old bookmarks do not 404; send them to the Bespoke hub.
 */
export default function BespokeCatalogPage() {
  permanentRedirect("/bespoke")
}
