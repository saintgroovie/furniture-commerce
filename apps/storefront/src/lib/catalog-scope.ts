/**
 * Какие значения `product.metadata.collection` показываются в публичном каталоге.
 * Товары без `metadata.collection` пропускаются (демо seed и legacy).
 * Явно паузируемые slug скрываются.
 *
 * Исключение демо из канонического `seed.ts` (**`isMedusaCanonicalSeedDemoProduct`**) сюда **не**
 * включается: kids-ассортимент задаётся в `resolveKidsProducts()` (room sets +
 * `metadata.collection === oliver-kids`), где демо-SKU из seed отфильтровываются отдельно.
 */

/**
 * В синхроне с `PRODUCTS[].sku` в `apps/backend/src/scripts/seed.ts` (`handle` при создании = sku).
 * Скрытие на витрине: только **`/catalog`** и **`/bespoke/catalog`** (не внутри `isProductInActiveCatalogScope`).
 */
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

/** Stable ingestion key for Oliver детская линейка (`metadata.collection`). */
export const OLIVER_KIDS_COLLECTION_KEY = "oliver-kids" as const

export function isOliverKidsCollectionProduct(
  product: Record<string, unknown>
): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  return meta?.collection === OLIVER_KIDS_COLLECTION_KEY
}

export function isProductInActiveCatalogScope(product: Record<string, unknown>): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  const key = meta?.collection
  if (key == null || key === "") return true
  if (typeof key !== "string") return true
  if (PAUSED_COLLECTION_KEYS.has(key)) return false
  if (ACTIVE_COLLECTION_KEYS.has(key)) return true
  return false
}
