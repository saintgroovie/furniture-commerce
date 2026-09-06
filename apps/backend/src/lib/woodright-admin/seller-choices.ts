import { resolveAdminCollectionLabel } from "../../admin/lib/collection-display-labels"
import { WOODRIGHT_ACTIVE_COLLECTION_KEYS } from "./catalog-scope"

export function sellerCollectionChoices(): Array<{ key: string; label: string }> {
  return WOODRIGHT_ACTIVE_COLLECTION_KEYS.map((key) => ({
    key,
    label: resolveAdminCollectionLabel({ metadataCollection: key }) ?? key,
  }))
}

export const SELLER_CLASSIFICATION_CHOICES = [
  { key: "STANDARD", label: "Готовый товар" },
  { key: "CONFIGURABLE", label: "С выбором исполнения" },
  { key: "BESPOKE", label: "По проекту" },
] as const
