/**
 * Buyer-facing catalog scope — keep in sync with `apps/storefront/src/lib/catalog-scope.ts`.
 */
import {
  isOliverKidsCollectionProduct,
  OLIVER_KIDS_COLLECTION_KEY,
} from "../oliver-kids-scope"

export { isOliverKidsCollectionProduct, OLIVER_KIDS_COLLECTION_KEY }

const MEDUSA_CANONICAL_SEED_DEMO_HANDLES = new Set([
  "stul-loft",
  "tumba-prikrovatnaya",
  "polka-nastennaya",
  "stol-obedennyj-loft",
  "komod-trehdvernyj",
  "stol-pismennyj",
  "kuhnya-na-zakaz",
  "garderobnaya",
  "shkaf-v-nishu",
  "stul-ofisnyj",
  "tumba-tv",
  "krovat-detskaya",
  "stol-shkolnyj",
  "stellazh-knizhnyj",
  "stol-kompyuternyj",
])

export function isMedusaCanonicalSeedDemoProduct(product: Record<string, unknown>): boolean {
  const handle = product.handle
  if (typeof handle !== "string" || handle === "") return false
  return MEDUSA_CANONICAL_SEED_DEMO_HANDLES.has(handle)
}

const PAUSED_COLLECTION_KEYS = new Set([
  "princess-rose",
  "country-london-paris",
  "oxford",
  "provence",
])

const ACTIVE_COLLECTION_KEYS = new Set([
  "greenwich",
  "oliver",
  "oliver-adult",
  "oliver-kids",
  "willie-winkie",
  "monchelsea",
])

export function isProductInActiveCatalogScope(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  const key = meta?.collection
  if (key == null || key === "") return true
  if (typeof key !== "string") return true
  if (PAUSED_COLLECTION_KEYS.has(key)) return false
  if (ACTIVE_COLLECTION_KEYS.has(key)) return true
  return false
}

export function isProductInMainCatalogScope(product: Record<string, unknown>): boolean {
  if (isOliverKidsCollectionProduct(product)) return false
  return isProductInActiveCatalogScope(product)
}
